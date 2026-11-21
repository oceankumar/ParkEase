import test from "node:test";
import assert from "node:assert/strict";
import { calculateBill, entryDeadline, entryReason, serializeBooking } from "../src/services/bookingLifecycle.js";
import { bookingWindow } from "../src/utils/bookingWindow.js";

const start = new Date("2026-11-20T08:00:00.000Z");
const booking = { status: "CONFIRMED", startTime: start, endTime: new Date(start.getTime() + 3_600_000),
  hourlyRatePaise: 2500, totalAmountPaise: 2500 };
test("Availability can refresh a started window without allowing a past-start booking", () => {
  const input = { startTime: start.toISOString(), endTime: booking.endTime.toISOString() };
  const now = start.getTime() + 60000;
  assert.throws(() => bookingWindow(input, now), /future start/);
  assert.equal(bookingWindow(input, now, { allowStarted: true }).startTime.toISOString(), input.startTime);
  assert.throws(() => bookingWindow(input, start.getTime() + 3600000, { allowStarted: true }), /future start/);
});
test("entry deadline is exclusive and estimate stays intact", () => {
  const deadline = entryDeadline(booking);
  assert.equal(deadline.toISOString(), "2026-11-20T08:15:00.000Z");
  assert.equal(entryReason(booking, start), null);
  assert.equal(entryReason(booking, deadline), "ENTRY_DEADLINE_PASSED");
  assert.equal(serializeBooking(booking, deadline).status, "EXPIRED");
  assert.equal(booking.totalAmountPaise, 2500);
});
test("billing uses original integer rate and rounds each started hour", () => {
  for (const [minutes, hours] of [[1, 1], [60, 1], [61, 2], [121, 3]]) {
    const bill = calculateBill({ entryTime: start, hourlyRatePaise: 2500 }, new Date(start.getTime() + minutes * 60_000));
    assert.equal(bill.billableHours, hours);
    assert.equal(bill.calculatedAmountPaise, hours * 2500);
  }
  assert.equal(calculateBill({ entryTime: start, hourlyRatePaise: 0 }, start).calculatedAmountPaise, 0);
  assert.throws(() => calculateBill({ entryTime: start, hourlyRatePaise: 100 }, new Date(start.getTime() - 1)));
});
