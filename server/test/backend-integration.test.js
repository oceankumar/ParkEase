import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import test from "node:test";
import mongoose from "mongoose";
import app from "../src/app.js";
import Booking from "../src/models/Booking.js";
import Mall from "../src/models/Mall.js";
import User from "../src/models/User.js";
import RefreshToken from "../src/models/RefreshToken.js";
import GuardAssignment from "../src/models/GuardAssignment.js";
import QRToken from "../src/models/QRToken.js";
import GateOperation from "../src/models/GateOperation.js";
import { hashPassword } from "../src/utils/password.js";
import { signAccessToken } from "../src/utils/jwt.js";
import { expireBooking, sweepExpired } from "../src/services/expiryService.js";
import { migrationPlan } from "../src/services/bookingMigration.js";
import { assertRequiredIndexes, assertTransactionSupport } from "../src/services/indexReadiness.js";
import { overlappingBookings } from "../src/utils/bookingWindow.js";

const uri = process.env.AUTH_TEST_MONGODB_URI;
const skip = !uri && "Set AUTH_TEST_MONGODB_URI to a disposable MongoDB replica set; never use production";
test("backend reservation and gate scenario on isolated replica set", { skip }, async (t) => {
  process.env.JWT_ACCESS_SECRET = randomUUID() + randomUUID();
  process.env.BCRYPT_SALT_ROUNDS = "4";
  await mongoose.connect(uri, { dbName: `parkease_backend_test_${randomUUID().replaceAll("-", "")}`, serverSelectionTimeoutMS: 5000 });
  t.after(async () => { try { await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); } });
  assertTransactionSupport(await mongoose.connection.db.admin().command({ hello: 1 }));
  await Promise.all([Booking.init(), Mall.init(), User.init(), RefreshToken.init(), GuardAssignment.init(), QRToken.init(), GateOperation.init()]);
  await assertRequiredIndexes();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const api = async (path, user, method = "GET", body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { ...(user ? { Authorization: `Bearer ${signAccessToken(user)}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const password = await hashPassword("temporary-password-1");
  const [admin, owner, wrongOwner, driver, otherDriver] = await User.create([
    { name: "Admin", email: "admin@integration.test", role: "ADMIN", status: "ACTIVE", passwordHash: password },
    { name: "Owner", email: "owner@integration.test", role: "MALL_OWNER", status: "ACTIVE", passwordHash: password },
    { name: "Other Owner", email: "other-owner@integration.test", role: "MALL_OWNER", status: "ACTIVE", passwordHash: password },
    { name: "Driver", email: "driver@integration.test", role: "USER", status: "ACTIVE", passwordHash: password },
    { name: "Other Driver", email: "other-driver@integration.test", role: "USER", status: "ACTIVE", passwordHash: password },
  ]);
  const bayId = randomUUID();
  const bay = { id: bayId, code: "A01", vehicleType: "CAR", status: "AVAILABLE" };
  const mall = await Mall.create({ ownerId: owner._id, name: "Integration Mall", city: "Delhi", address: "1 Gate Street",
    status: "APPROVED", hourlyRatePaise: 2500, openingTime: "00:00", closingTime: "23:59",
    parkingPublished: { floors: [{ name: "B1", rows: [[bay, null]] }] } });
  const otherMall = await Mall.create({ ownerId: wrongOwner._id, name: "Other Mall", city: "Delhi", address: "2 Gate Street",
    status: "APPROVED", hourlyRatePaise: 1000 });
  assert.equal((await api(`/malls/${mall.id}/guards`, wrongOwner, "POST", {
    name: "Guard", email: "guard@integration.test", initialPassword: "temporary-password-1" })).status, 404);
  assert.equal((await api(`/malls/${mall.id}/guards`, driver, "POST", {
    name: "Guard", email: "guard@integration.test", initialPassword: "temporary-password-1" })).status, 403);
  const provision = await api(`/malls/${mall.id}/guards`, owner, "POST", {
    name: "Gate Guard", email: "guard@integration.test", initialPassword: "temporary-password-1" });
  assert.equal(provision.status, 201, JSON.stringify(provision.body));
  assert.equal(provision.body.data.guard.passwordHash, undefined);
  const guard = await User.findById(provision.body.data.guard._id);
  const oldGuardToken = signAccessToken(guard);
  const beforeChange = await api("/qr/verify", guard, "POST", { mallId: mall.id, token: "a".repeat(64), action: "ENTRY" });
  assert.equal(beforeChange.status, 403);
  const changed = await api("/users/password", guard, "PATCH", {
    currentPassword: "temporary-password-1", newPassword: "changed-password-2" });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const activeGuard = await User.findById(guard._id);
  assert.equal(activeGuard.mustChangePassword, false);
  assert.equal((await api("/users/profile", null, "GET", undefined,
    { Authorization: `Bearer ${oldGuardToken}` })).status, 401, "Password change invalidates already-issued access tokens");
  assert.equal((await api("/users/profile", activeGuard)).status, 200);
  assert.equal((await api(`/malls/${mall.id}/guard-assignments`, wrongOwner, "POST", { guardId: guard.id })).status, 404);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const future = { mallId: mall.id, bayId, vehicleNumber: "DL01AB1234", vehicleType: "CAR",
    startTime: new Date(`${tomorrow}T12:00:00+05:30`).toISOString(),
    endTime: new Date(`${tomorrow}T13:00:00+05:30`).toISOString() };
  const key = randomUUID();
  const sameKey = await Promise.all([api("/bookings", driver, "POST", future, { "Idempotency-Key": key }),
    api("/bookings", driver, "POST", future, { "Idempotency-Key": key })]);
  assert.deepEqual(sameKey.map((item) => item.status).sort(), [200, 201]);
  assert.equal(sameKey[0].body.data.booking._id, sameKey[1].body.data.booking._id);
  assert.equal((await api("/bookings", driver, "POST", { ...future, vehicleNumber: "DL01XY9876" },
    { "Idempotency-Key": key })).status, 409);
  assert.equal((await api("/bookings", otherDriver, "POST", future)).status, 409);
  const adjacent = await api("/bookings", otherDriver, "POST", { ...future,
    startTime: future.endTime, endTime: new Date(`${tomorrow}T14:00:00+05:30`).toISOString() });
  assert.equal(adjacent.status, 201);
  const overviewSlots = await api(`/malls/${mall.id}/slots?view=reservations`, null);
  assert.equal(overviewSlots.body.data.slots[0].status, "RESERVED", "Future reservations must be visible in the overview");
  assert.equal(overviewSlots.body.data.availabilityScope, "RESERVATIONS");
  const bookedWindow = new URLSearchParams({ startTime: future.startTime, endTime: future.endTime });
  assert.equal((await api(`/malls/${mall.id}/slots?${bookedWindow}`, null)).body.data.slots[0].status, "RESERVED");
  const laterWindow = new URLSearchParams({ startTime: adjacent.body.data.booking.endTime,
    endTime: new Date(new Date(adjacent.body.data.booking.endTime).getTime() + 3600000).toISOString() });
  assert.equal((await api(`/malls/${mall.id}/slots?${laterWindow}`, null)).body.data.slots[0].status, "AVAILABLE", "A non-overlapping visit can still use the same bay");
  for (const [role, path] of [[owner, "/analytics/owner/overview"], [admin, "/analytics/admin/overview"]]) {
    const metrics = (await api(path, role)).body.data.metrics;
    assert.equal(metrics.availableNow, 1, "A future booking does not occupy a bay right now");
    assert.equal(metrics.unreservedBays, 0);
    assert.equal(metrics.reservedBays, 1, "Adjacent reservations on one bay count as one reserved bay");
  }
  const invalidHours = await api(`/malls/${mall.id}`, owner, "PATCH", { openingTime: "13:00" });
  assert.equal(invalidHours.status, 409, JSON.stringify(invalidHours.body));
  assert.equal(invalidHours.body.error.code, "MALL_SCHEDULE_CONFLICT");
  assert.equal((await Mall.findById(mall._id)).openingTime, "00:00");
  // Live analytics groups many future reservations without loading their full documents.
  await Booking.insertMany(Array.from({ length: 50 }, (_, index) => ({
    driverId: otherDriver._id, mallId: mall._id, mallName: mall.name, bayId: randomUUID(),
    slotCode: `T${index}`, floor: "B1", vehicleType: "CAR", vehicleNumber: "DL01CD1234",
    startTime: new Date(future.startTime), endTime: new Date(future.endTime),
    entryDeadline: new Date(new Date(future.startTime).getTime() + 15 * 60_000),
    hourlyRatePaise: 2500, totalAmountPaise: 2500,
  })));
  const currentMetrics = (await api("/analytics/owner/overview", owner)).body.data.metrics;
  assert.equal(currentMetrics.upcomingBookings, 52);
  assert.equal(currentMetrics.totalBays, 1);
  assert.equal(currentMetrics.reservedBays, 1, "Reservations for removed bay IDs must not inflate bay totals");
  assert.equal(currentMetrics.unreservedBays, 0);
  const now = Date.now();
  const booking = await Booking.create({ driverId: driver._id, mallId: mall._id, mallName: mall.name,
    bayId, slotCode: "A01", floor: "B1", vehicleType: "CAR", vehicleNumber: "DL01AB1234",
    startTime: new Date(now - 60_000), endTime: new Date(now + 3_600_000),
    entryDeadline: new Date(now + 10 * 60_000), hourlyRatePaise: 2500, totalAmountPaise: 2500 });
  const qr = (purpose) => api(`/bookings/${booking.id}/qr`, driver, "POST", { purpose });
  const first = await qr("ENTRY");
  const second = await qr("ENTRY");
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal((await api(`/bookings/${booking.id}/qr`, otherDriver, "POST", { purpose: "ENTRY" })).status, 404);
  assert.equal((await api("/qr/verify", activeGuard, "POST", {
    mallId: mall.id, token: "invalid", action: "ENTRY" })).status, 400);
  assert.equal((await api("/qr/verify", activeGuard, "POST", {
    mallId: mall.id, token: "f".repeat(64), action: "ENTRY" })).body.data.reasonCode, "INVALID_TOKEN");
  assert.notEqual(first.body.data.token, second.body.data.token);
  assert.equal((await QRToken.findOne({ bookingId: booking._id, purpose: "ENTRY", status: "ACTIVE" })).tokenHash, undefined);
  assert.equal((await api("/qr/verify", activeGuard, "POST", {
    mallId: mall.id, token: first.body.data.token, action: "ENTRY" })).body.data.reasonCode, "TOKEN_USED");
  await QRToken.updateOne({ bookingId: booking._id, status: "ACTIVE" }, { $set: { expiresAt: new Date(0) } });
  const expiredToken = await api("/qr/verify", activeGuard, "POST", {
    mallId: mall.id, token: second.body.data.token, action: "ENTRY" });
  assert.equal(expiredToken.body.data.reasonCode, "TOKEN_EXPIRED");
  const renewed = await qr("ENTRY");
  assert.equal(renewed.status, 201);
  assert.equal((await api("/qr/verify", activeGuard, "POST", {
    mallId: mall.id, token: renewed.body.data.token, action: "EXIT" })).body.data.reasonCode, "WRONG_PURPOSE");
  assert.equal((await api("/qr/verify", activeGuard, "POST", {
    mallId: otherMall.id, token: renewed.body.data.token, action: "ENTRY" })).status, 403);
  assert.equal((await api(`/guards/assignments/${provision.body.data.assignment.id}`, owner, "PATCH", { isActive: false })).status, 200);
  assert.equal((await api("/qr/verify", activeGuard, "POST", {
    mallId: mall.id, token: renewed.body.data.token, action: "ENTRY" })).status, 403);
  assert.equal((await api(`/guards/assignments/${provision.body.data.assignment.id}`, owner, "PATCH", { isActive: true })).status, 200);
  const entryId = randomUUID();
  const entryBody = { mallId: mall.id, token: renewed.body.data.token, operationId: entryId };
  const competingEntryBody = { ...entryBody, operationId: randomUUID() };
  const entries = await Promise.all([api("/operations/entry", activeGuard, "POST", entryBody),
    api("/operations/entry", activeGuard, "POST", competingEntryBody)]);
  assert.deepEqual(entries.map((item) => item.status).sort(), [200, 409]);
  const entry = entries.find((item) => item.status === 200);
  const winningEntryBody = entries[0].status === 200 ? entryBody : competingEntryBody;
  assert.equal(entry.status, 200, JSON.stringify(entry.body));
  assert.equal((await api("/operations/entry", activeGuard, "POST", winningEntryBody)).status, 200);
  assert.equal((await api("/operations/entry", activeGuard, "POST", { ...entryBody, operationId: randomUUID() })).status, 409);
  assert.equal((await api("/operations/entry", activeGuard, "POST", { ...entryBody, token: first.body.data.token })).status, 409);
  assert.equal(await GateOperation.countDocuments({ bookingId: booking._id, action: "ENTRY" }), 1);
  const competing = await Booking.create({ driverId: driver._id, mallId: otherMall._id, mallName: otherMall.name,
    bayId: randomUUID(), slotCode: "B02", floor: "B1", vehicleType: "CAR", vehicleNumber: "DL01AB1234",
    startTime: new Date(now - 60_000), endTime: new Date(now + 3_600_000),
    entryDeadline: new Date(now + 10 * 60_000), hourlyRatePaise: 1000, totalAmountPaise: 1000 });
  await api(`/malls/${otherMall.id}/guard-assignments`, admin, "POST", { guardId: guard.id });
  const competingQR = await api(`/bookings/${competing.id}/qr`, driver, "POST", { purpose: "ENTRY" });
  assert.equal((await api("/operations/entry", activeGuard, "POST", {
    mallId: otherMall.id, token: competingQR.body.data.token, operationId: randomUUID() })).status, 409);
  assert.equal((await api(`/malls/${mall.id}/slots`, null)).body.data.slots[0].status, "OCCUPIED");
  assert.equal((await api(`/bookings/${booking.id}/bill`, driver)).status, 409);
  await Mall.updateOne({ _id: mall._id }, { hourlyRatePaise: 9999 });
  const exitQR = await qr("EXIT");
  assert.equal(exitQR.status, 201);
  const exitBody = { mallId: mall.id, token: exitQR.body.data.token, operationId: randomUUID() };
  const exits = await Promise.all([api("/operations/exit", activeGuard, "POST", exitBody),
    api("/operations/exit", activeGuard, "POST", exitBody)]);
  assert.deepEqual(exits.map((item) => item.status).sort(), [200, 200]);
  assert.equal(await GateOperation.countDocuments({ bookingId: booking._id, action: "EXIT" }), 1);
  const bill = (await api(`/bookings/${booking.id}/bill`, driver)).body.data.bill;
  assert.equal(bill.hourlyRateSnapshotPaise, 2500);
  assert.equal(bill.calculatedAmountPaise, 2500);
  assert.equal((await api(`/bookings/${booking.id}/bill`, otherDriver)).status, 404);
  assert.equal((await api(`/bookings/${booking.id}/bill`, wrongOwner)).status, 404);
  assert.equal((await api(`/bookings/${booking.id}/bill`, admin)).status, 200);
  assert.equal((await api("/analytics/owner/overview", wrongOwner)).body.data.metrics.billedAmountPaise, 0);
  assert.equal((await api("/analytics/owner/overview", owner)).body.data.metrics.billedAmountPaise, 2500);
  assert.equal((await api("/analytics/admin/overview", admin)).body.data.metrics.billedAmountPaise, 2500);
  assert.equal((await api(`/malls/${mall.id}/slots`, null)).body.data.slots[0].status, "AVAILABLE");
  const delayedNow = new Date();
  const delayedWindow = { startTime: new Date(delayedNow.getTime() + 60_000),
    endTime: new Date(delayedNow.getTime() + 31 * 60_000) };
  const overdue = await Booking.create({ driverId: otherDriver._id, mallId: mall._id, mallName: mall.name,
    bayId, slotCode: "A01", floor: "B1", vehicleType: "CAR", vehicleNumber: "DL01ZZ1234",
    startTime: new Date(delayedNow.getTime() - 20 * 60_000),
    endTime: new Date(delayedNow.getTime() + 60 * 60_000),
    entryDeadline: new Date(delayedNow.getTime() - 5 * 60_000),
    hourlyRatePaise: 2500, totalAmountPaise: 2500 });
  const legacyHold = await Booking.create({ driverId: otherDriver._id, mallId: mall._id, mallName: mall.name,
    bayId, slotCode: "A01", floor: "B1", vehicleType: "CAR", vehicleNumber: "DL01ZZ5678",
    startTime: new Date(delayedNow.getTime() - 20 * 60_000),
    endTime: new Date(delayedNow.getTime() + 60 * 60_000),
    hourlyRatePaise: 2500, totalAmountPaise: 2500 });
  assert.equal(await Booking.exists({ ...overlappingBookings(mall._id, delayedWindow), bayId }), null);
  assert.equal((await api(`/malls/${mall.id}/slots`, null)).body.data.slots[0].status, "AVAILABLE");
  assert.equal((await api("/analytics/owner/overview", owner)).body.data.metrics.reservedNow, 0);
  let nextStart = new Date(Math.ceil((Date.now() + 60_000) / 1_800_000) * 1_800_000);
  const istMinutes = (nextStart.getUTCHours() * 60 + nextStart.getUTCMinutes() + 330) % 1440;
  if (istMinutes > 1380) nextStart = new Date(nextStart.getTime() + (1440 - istMinutes) * 60_000);
  const replacement = await api("/bookings", driver, "POST", {
    mallId: mall.id, bayId, vehicleNumber: "DL01AA1234", vehicleType: "CAR",
    startTime: nextStart.toISOString(), endTime: new Date(nextStart.getTime() + 30 * 60_000).toISOString(),
  });
  assert.equal(replacement.status, 201, JSON.stringify(replacement.body));
  assert.equal((await api(`/bookings/${replacement.body.data.booking._id}/cancel`, driver, "PATCH")).status, 200);
  await expireBooking(overdue._id);
  assert.equal((await Booking.findById(overdue._id)).expiredAt.toISOString(), overdue.entryDeadline.toISOString());
  assert.equal((await Booking.findById(legacyHold._id)).status, "CONFIRMED");
  const expired = await Booking.create({ driverId: otherDriver._id, mallId: mall._id, mallName: mall.name,
    bayId, slotCode: "A01", floor: "B1", vehicleType: "CAR", vehicleNumber: "DL01CD1234",
    startTime: new Date(now - 3_600_000), endTime: new Date(now - 30 * 60_000),
    entryDeadline: new Date(now - 45 * 60_000), hourlyRatePaise: 2500, totalAmountPaise: 2500 });
  await Promise.all([sweepExpired(), expireBooking(expired._id)]);
  assert.equal((await Booking.findById(expired._id)).status, "EXPIRED");
  assert.equal(await expireBooking(expired._id), false);
  assert.equal(migrationPlan({ status: "CONFIRMED", startTime: new Date(now - 3_600_000),
    endTime: new Date(now - 30 * 60_000) }).changes.status, "EXPIRED");
  assert.equal(migrationPlan({ status: "ACTIVE", entryTime: null }).problems[0], "ACTIVE_TIME_MISMATCH");
  const legacy = await Booking.create({ driverId: otherDriver._id, mallId: mall._id, mallName: mall.name,
    bayId, slotCode: "A01", floor: "B1", vehicleType: "CAR", vehicleNumber: "DL01XY1234",
    startTime: new Date(now - 7_200_000), endTime: new Date(now - 3_600_000),
    hourlyRatePaise: 2500, totalAmountPaise: 2500 });
  const migrationURI = new URL(uri);
  migrationURI.pathname = `/${mongoose.connection.name}`;
  const migrate = async (mode = []) => {
    const { stdout } = await promisify(execFile)(process.execPath,
      [fileURLToPath(new URL("../src/scripts/migrateBookings.js", import.meta.url)), ...mode],
      { env: { ...process.env, MONGODB_URI: migrationURI.href } });
    return JSON.parse(stdout.trim());
  };
  assert.ok((await migrate()).expire >= 1);
  assert.ok((await migrate()).expire >= 1);
  await assert.rejects(migrate(["--apply"]), /confirm-database/);
  const confirmed = ["--apply", `--confirm-database=${mongoose.connection.name}`];
  assert.ok((await migrate(confirmed)).expire >= 1);
  assert.equal((await migrate(confirmed)).expire, 0);
  assert.equal((await Booking.findById(legacy._id)).status, "EXPIRED");
  assert.equal((await Booking.findById(booking._id)).status, "COMPLETED");
  assert.equal(migrationPlan({ status: "COMPLETED", entryTime: new Date(), exitTime: new Date() }).problems[0], "COMPLETED_BILL_UNVERIFIED");
  const raceBooking = await Booking.create({ driverId: otherDriver._id, mallId: mall._id, mallName: mall.name,
    bayId, slotCode: "A01", floor: "B1", vehicleType: "CAR", vehicleNumber: "DL01XY3456",
    startTime: new Date(Date.now() - 60_000), endTime: new Date(Date.now() + 3_600_000),
    entryDeadline: new Date(Date.now() + 10 * 60_000), hourlyRatePaise: 2500, totalAmountPaise: 2500 });
  const raceQR = await api(`/bookings/${raceBooking.id}/qr`, otherDriver, "POST", { purpose: "ENTRY" });
  const race = await Promise.all([
    api(`/guards/assignments/${provision.body.data.assignment.id}`, owner, "PATCH", { isActive: false }),
    api("/operations/entry", activeGuard, "POST", { mallId: mall.id,
      token: raceQR.body.data.token, operationId: randomUUID() }),
  ]);
  assert.equal(race[0].status, 200);
  assert.ok([200, 403].includes(race[1].status), JSON.stringify(race[1]));
  assert.equal((await api("/qr/verify", activeGuard, "POST", {
    mallId: mall.id, token: raceQR.body.data.token, action: "ENTRY" })).status, 403);
  const suspend = await api(`/admin/guards/${guard.id}/status`, admin, "PATCH", { status: "SUSPENDED" });
  assert.equal(suspend.status, 200);
  assert.equal((await api("/operations/recent?mallId=" + mall.id, activeGuard)).status, 403);
});
