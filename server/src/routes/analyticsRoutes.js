import { Router } from "express";
import ROLES from "../constants/roles.js";
import authenticate from "../middleware/authenticate.js";
import { requireActiveAccount } from "../middleware/authorize.js";
import Booking from "../models/Booking.js";
import Mall from "../models/Mall.js";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { managedMall } from "../services/guardAccess.js";
import { analyticsRange, dateKey, day } from "../services/analyticsDateRange.js";
import { liveConfirmedBookings } from "../utils/bookingWindow.js";

const router = Router();
router.use(authenticate, requireActiveAccount, (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const keys = ["totalBays", "availableNow", "reservedNow", "occupiedNow", "maintenanceNow",
  "unreservedBays", "reservedBays", "upcomingBookings", "activeVisits", "completedVisits", "expiredBookings", "cancelledBookings", "billedAmountPaise"];
const zero = () => Object.fromEntries(keys.map((key) => [key, 0]));


async function overview(mallFilter, query) {
  const now = new Date();
  const { start, end } = analyticsRange(query, now);
  const ids = await Mall.distinct("_id", mallFilter);
  const byMall = new Map();
  const series = [];
  for (let t = start.getTime(); t < end.getTime(); t += day)
    series.push({ date: dateKey(new Date(t)), completedVisits: 0, billedAmountPaise: 0 });
  const byDay = new Map(series.map((item) => [item.date, item]));
  if (ids.length) {
    // Aggregate current visits into one compact row per mall instead of loading
    // every live booking, including all future reservations, into the API process.
    const currentRows = await Booking.aggregate([
      { $match: { mallId: { $in: ids }, $or: [{ status: "ACTIVE" }, liveConfirmedBookings(now)] } },
      { $project: { mallId: 1, bayId: 1, status: 1,
        upcoming: { $and: [{ $eq: ["$status", "CONFIRMED"] }, { $gt: ["$startTime", now] }] },
        reserved: { $and: [{ $eq: ["$status", "CONFIRMED"] },
          { $lte: ["$startTime", now] }, { $gt: ["$endTime", now] }] },
      } },
      { $group: { _id: "$mallId",
        activeVisits: { $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] } },
        upcomingBookings: { $sum: { $cond: ["$upcoming", 1, 0] } },
        activeBayIds: { $addToSet: { $cond: [{ $eq: ["$status", "ACTIVE"] }, "$bayId", null] } },
        reservedBayIds: { $addToSet: { $cond: ["$reserved", "$bayId", null] } },
        allReservedBayIds: { $addToSet: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, "$bayId", null] } },
      } },
    ]);
    const currentByMall = new Map(currentRows.map((row) => [String(row._id), row]));
    // A mall layout is at most 600 cells. Streaming avoids holding all published
    // layouts at once; the response itself still has one metric row per mall.
    for await (const mall of Mall.find(mallFilter).select("name +parkingPublished").sort({ _id: 1 }).cursor()) {
      const metrics = zero();
      const current = currentByMall.get(String(mall._id));
      metrics.activeVisits = current?.activeVisits ?? 0;
      metrics.upcomingBookings = current?.upcomingBookings ?? 0;
      const active = new Set(current?.activeBayIds ?? []);
      const reserved = new Set(current?.reservedBayIds ?? []);
      const allReserved = new Set(current?.allReservedBayIds ?? []);
      for (const floor of mall.parkingPublished?.floors ?? []) for (const row of floor.rows) for (const bay of row) {
        if (!bay) continue;
        metrics.totalBays++;
        if (active.has(bay.id)) metrics.occupiedNow++;
        else if (bay.status === "MAINTENANCE") metrics.maintenanceNow++;
        else if (reserved.has(bay.id)) metrics.reservedNow++;
        else metrics.availableNow++;
        if (!active.has(bay.id) && bay.status !== "MAINTENANCE") {
          if (allReserved.has(bay.id)) metrics.reservedBays++;
          else metrics.unreservedBays++;
        }
      }
      byMall.set(String(mall._id), { mallId: mall._id, mallName: mall.name, metrics });
    }
    const historical = await Booking.aggregate([
      { $match: { mallId: { $in: ids }, $or: [
        { status: "COMPLETED", exitTime: { $gte: start, $lt: end } },
        { status: "EXPIRED", expiredAt: { $gte: start, $lt: end } },
        { status: "CANCELLED", cancelledAt: { $gte: start, $lt: end } },
      ] } },
      { $project: { mallId: 1, status: 1, eventTime: { $switch: { branches: [
        { case: { $eq: ["$status", "COMPLETED"] }, then: "$exitTime" },
        { case: { $eq: ["$status", "EXPIRED"] }, then: "$expiredAt" },
      ], default: "$cancelledAt" } } } },
      { $group: { _id: { mallId: "$mallId", status: "$status", date: {
        $dateToString: { format: "%Y-%m-%d", date: "$eventTime", timezone: "Asia/Kolkata" },
      } }, count: { $sum: 1 } } },
    ]);
    const field = { COMPLETED: "completedVisits", EXPIRED: "expiredBookings", CANCELLED: "cancelledBookings" };
    for (const row of historical) {
      byMall.get(String(row._id.mallId)).metrics[field[row._id.status]] += row.count;
      if (row._id.status === "COMPLETED") byDay.get(row._id.date).completedVisits += row.count;
    }
    const billed = await Booking.aggregate([
      { $match: { mallId: { $in: ids }, status: "COMPLETED", billingStatus: "GENERATED",
        billGeneratedAt: { $gte: start, $lt: end } } },
      { $group: { _id: { mallId: "$mallId", date: { $dateToString: {
        format: "%Y-%m-%d", date: "$billGeneratedAt", timezone: "Asia/Kolkata",
      } } }, amount: { $sum: "$calculatedAmountPaise" } } },
    ]);
    for (const row of billed) {
      byMall.get(String(row._id.mallId)).metrics.billedAmountPaise += row.amount;
      byDay.get(row._id.date).billedAmountPaise += row.amount;
    }
  }
  const perMall = [...byMall.values()];
  const metrics = zero();
  for (const mall of perMall) for (const key of keys) metrics[key] += mall.metrics[key];
  return { metrics, perMall, series, generatedAt: now.toISOString() };
}

router.get("/owner/overview", async (req, res) => {
  if (req.user.role !== ROLES.MALL_OWNER) throw new AppError(403, "Owner required", "FORBIDDEN");
  res.json({ success: true, data: await overview({ ownerId: req.user._id }, req.query) });
});
router.get("/owner/malls/:mallId", async (req, res) => {
  if (req.user.role !== ROLES.MALL_OWNER) throw new AppError(403, "Owner required", "FORBIDDEN");
  const mall = await managedMall(req.user, req.params.mallId, null, false);
  res.json({ success: true, data: await overview({ _id: mall._id }, req.query) });
});
router.get("/admin/overview", async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) throw new AppError(403, "Admin required", "FORBIDDEN");
  const data = await overview({}, req.query);
  data.ownerCount = await User.countDocuments({ role: ROLES.MALL_OWNER });
  data.mallCount = await Mall.countDocuments();
  data.pendingOwnerCount = await User.countDocuments({ role: ROLES.MALL_OWNER, status: "PENDING_APPROVAL" });
  data.pendingMallCount = await Mall.countDocuments({ status: "PENDING" });
  res.json({ success: true, data });
});
export default router;
