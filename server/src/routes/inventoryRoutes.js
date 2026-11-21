import mongoose from "mongoose";
import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import { requireApprovedOwner } from "../middleware/authorize.js";
import Booking from "../models/Booking.js";
import { bookingWindow, checkOperatingHours, liveConfirmedBookings, overlappingBookings } from "../utils/bookingWindow.js";
import Mall from "../models/Mall.js";
import AppError from "../utils/AppError.js";
import { validateObjectId } from "../utils/validators.js";

const router = Router();
const fields = "_id name hourlyRatePaise +parkingDraft +parkingPublished +parkingRevision";
const types = ["CAR", "BIKE"];
const empty = { floors: [] };

function invalid(message) {
  throw new AppError(400, message, "INVALID_LAYOUT");
}

function list(value, limit) {
  if (!Array.isArray(value) || value.length > limit) invalid("The layout exceeds its size limits.");
  return value;
}

function label(value) {
  if (typeof value !== "string" || !/^[a-z\d][a-z\d _-]{0,23}$/i.test(value.trim())) {
    invalid("Use 1–24 letters, numbers, spaces, hyphens or underscores for names and codes.");
  }
  return value.trim();
}

function cleanLayout(layout, publishing) {
  const ids = new Set();
  let cells = 0;
  const names = new Set();
  const floors = list(layout?.floors, 20).map((floor) => {
    const name = label(floor?.name);
    if (names.has(name.toUpperCase())) invalid("Floor names must be unique.");
    names.add(name.toUpperCase());
    const codes = new Set();
    const rows = list(floor.rows, 30).map((row) => list(row, 60).map((bay) => {
      if (++cells > 600) invalid("A mall can have up to 600 bays and gaps combined.");
      if (bay === null) return null;
      const id = bay?.id;
      const code = label(bay?.code);
      if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id) || ids.has(id)) invalid("Each bay must have a unique ID.");
      if (codes.has(code.toUpperCase())) invalid(`Duplicate bay code ${code} on ${name}.`);
      if (!types.includes(bay.vehicleType)) invalid("Choose Car or Bike for each bay.");
      ids.add(id);
      codes.add(code.toUpperCase());
      return { id, code, vehicleType: bay.vehicleType, accessible: bay.accessible === true, electric: bay.electric === true };
    }));
    if (publishing && codes.size === 0) invalid(`Add at least one bay to ${name} before publishing.`);
    return { name, rows };
  });
  if (publishing && !floors.length) invalid("Add a floor and its bays before publishing.");
  return { floors };
}

const baysOf = (layout) => layout.floors.flatMap((floor) => floor.rows.flat()).filter(Boolean);
const ownerView = (mall) => ({
  name: mall.name,
  revision: mall.parkingRevision ?? 0,
  draft: mall.parkingDraft ?? mall.parkingPublished ?? empty,
  published: mall.parkingPublished ?? empty,
});

function respond(res, data) {
  res.set("Cache-Control", "no-store").json({ success: true, data });
}

async function ownerMall(req, res, next) {
  req.mallFilter = {
    _id: validateObjectId(req.params.mallId, "mallId"),
    ownerId: req.user._id,
    status: "APPROVED",
  };
  req.mall = await Mall.findOne(req.mallFilter).select(fields).lean();
  if (!req.mall) throw new AppError(404, "Approved mall not found", "MALL_NOT_FOUND");
  next();
}

async function update(req, res, changes) {
  const revision = req.mall.parkingRevision ?? 0;
  if (req.body?.revision !== revision) throw new AppError(409, "Inventory changed. Reload before trying again.", "LAYOUT_CONFLICT");
  const filter = {
    ...req.mallFilter,
    parkingRevision: req.mall.parkingRevision === undefined ? { $exists: false } : revision,
  };
  async function write(session) {
    const mall = await Mall.findOneAndUpdate(filter, { $set: { ...changes, parkingRevision: revision + 1 } }, { new: true, session })
      .select(fields).lean();
    if (!mall) throw new AppError(409, "Inventory changed. Reload before trying again.", "LAYOUT_CONFLICT");
    if (changes.parkingPublished) {
      const before = new Map((req.mall.parkingPublished?.floors ?? []).flatMap((floor) =>
        floor.rows.flat().filter(Boolean).map((bay) => [bay.id, { ...bay, floor: floor.name }])));
      for (const floor of changes.parkingPublished.floors) {
        for (const bay of floor.rows.flat().filter(Boolean)) {
          const old = before.get(bay.id);
          if (old && old.code === bay.code && old.floor === floor.name &&
              old.vehicleType === bay.vehicleType && (old.status === bay.status ||
              (old.status === "MAINTENANCE" && bay.status === "AVAILABLE"))) before.delete(bay.id);
        }
      }
      if (before.size && await Booking.exists({
        mallId: mall._id, $or: [{ status: "ACTIVE" }, liveConfirmedBookings()],
        bayId: { $in: [...before.keys()] },
      }).session(session)) {
        throw new AppError(409, "This change affects a bay with an active or upcoming reservation.", "BAY_HAS_RESERVATIONS");
      }
    }
    return mall;
  }
  const mall = changes.parkingPublished ? await mongoose.connection.transaction(write) : await write();
  respond(res, ownerView(mall));
}

const owner = [authenticate, requireApprovedOwner, ownerMall];

router.get("/:mallId/inventory", ...owner, (req, res) => respond(res, ownerView(req.mall)));

router.put("/:mallId/inventory/draft", ...owner, async (req, res) => {
  await update(req, res, { parkingDraft: cleanLayout(req.body?.layout, false) });
});

router.put("/:mallId/inventory/published", ...owner, async (req, res) => {
  const layout = cleanLayout(req.body?.layout, true);
  const previous = new Map(baysOf(req.mall.parkingPublished ?? empty).map((bay) => [bay.id, bay.status]));
  const floors = layout.floors.map((floor) => ({
    ...floor,
    rows: floor.rows.map((row) => row.map((bay) => bay && { ...bay, status: previous.get(bay.id) ?? "AVAILABLE" })),
  }));
  await update(req, res, { parkingDraft: layout, parkingPublished: { floors } });
});

router.patch("/:mallId/inventory/bays/:bayId", ...owner, async (req, res) => {
  const { status } = req.body ?? {};
  if (!["AVAILABLE", "MAINTENANCE"].includes(status)) invalid("Select Available or Maintenance.");
  const layout = req.mall.parkingPublished ?? empty;
  if (!baysOf(layout).some((bay) => bay.id === req.params.bayId)) {
    throw new AppError(404, "Published bay not found", "BAY_NOT_FOUND");
  }
  const floors = layout.floors.map((floor) => ({
    ...floor,
    rows: floor.rows.map((row) => row.map((bay) => bay?.id === req.params.bayId ? { ...bay, status } : bay)),
  }));
  await update(req, res, { parkingPublished: { floors } });
});

router.get("/:mallId/slots", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const id = validateObjectId(req.params.mallId, "mallId");
  const mall = await Mall.findOne({ _id: id, status: "APPROVED" }).select("openingTime closingTime hourlyRatePaise +parkingPublished").lean();
  if (!mall) throw new AppError(404, "Mall not found", "MALL_NOT_FOUND");
  if (req.query.view !== undefined && req.query.view !== "reservations") invalid("Unknown availability view.");
  const window = req.query.startTime !== undefined || req.query.endTime !== undefined
    ? bookingWindow(req.query, Date.now(), { allowStarted: true }) : null;
  if (window) checkOperatingHours(mall, window);
  const now = new Date();
  const occupied = new Set(await Booking.distinct("bayId", { mallId: id, status: "ACTIVE" }));
  const reservationOverview = !window && req.query.view === "reservations";
  const reserved = new Set(await Booking.distinct("bayId", reservationOverview
    ? { mallId: id, ...liveConfirmedBookings(now) }
    : overlappingBookings(id, window ?? { startTime: now, endTime: now }, now)));
  const floors = mall.parkingPublished?.floors ?? [];
  const slots = floors.flatMap((floor) => floor.rows.flat().filter(Boolean).map((bay) => ({
    id: bay.id,
    slotNumber: bay.code,
    floor: floor.name,
    vehicleType: bay.vehicleType,
    status: occupied.has(bay.id) ? "OCCUPIED" : bay.status === "AVAILABLE" && reserved.has(bay.id) ? "RESERVED" : bay.status,
    isElectric: bay.electric,
    isAccessible: bay.accessible,
    hourlyRate: mall.hourlyRatePaise / 100,
  })));
  respond(res, { slots, availabilityScope: window ? "WINDOW" : reservationOverview ? "RESERVATIONS" : "NOW", generatedAt: now, layout: floors.map((floor) => ({
    name: floor.name,
    rows: floor.rows.map((row) => row.map((bay) => bay?.id ?? null)),
  })) });
});

export default router;
