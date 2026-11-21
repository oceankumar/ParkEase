import { sessionRequest } from "./authService.js";

export const BOOKING_SERVICE_STATUS = "RESERVATIONS_AVAILABLE";

export const PENDING_BOOKING_ROUTES = Object.freeze({
  CREATE_BOOKING: "/bookings",
  LIST_BOOKINGS: "/bookings",
  GET_BOOKING: "/bookings/:id",
  CANCEL_BOOKING: "/bookings/:id/cancel",
  VERIFY_QR: "/qr/verify",
});

let bookingApiConfirmed = true;

export function isBookingApiAvailable() {
  return bookingApiConfirmed;
}

export function setBookingApiAvailable(available) {
  bookingApiConfirmed = Boolean(available);
}

/**
 * Normalizes a list of bookings and computes summary counts.
 */
export function normalizeBookingsResponse(response) {
  if (!response || typeof response !== "object") {
    return {
      bookings: [],
      stats: { total: 0, active: 0, completed: 0, cancelled: 0 },
    };
  }

  const rawList = [response, response.data?.bookings, response.data, response.bookings]
    .find(Array.isArray) ?? [];

  const bookings = rawList.map((item) => ({
    id: item._id || item.id,
    mallId: item.mallId,
    canCancel: item.canCancel === true,
    mallName: item.mallName || item.mall?.name || "ParkEase Partner Mall",
    slotCode: item.slotCode || item.slot?.code || "Bay --",
    floor: item.floor || item.slot?.floor || "Level --",
    status: (item.status || "CONFIRMED").toUpperCase(),
    startTime: item.startTime || null,
    endTime: item.endTime || null,
    totalAmount: typeof item.totalAmountPaise === "number" ? item.totalAmountPaise / 100 : item.totalAmount ?? item.amount ?? 0,
    vehicleNumber: item.vehicleNumber || item.licensePlate || "N/A",
    qrCode: item.qrCode || null,
    entryDeadline: item.entryDeadline || null,
    enteredAt: item.entryTime || null,
    exitedAt: item.exitTime || null,
    billAvailable: item.billAvailable === true,
    qrEligiblePurposes: Array.isArray(item.qrEligiblePurposes) ? item.qrEligiblePurposes.filter((purpose) => ["ENTRY", "EXIT"].includes(purpose)) : [],
    vehicleType: item.vehicleType || null,
  }));

  const stats = {
    total: bookings.length,
    active: bookings.filter((b) => ["ACTIVE", "CONFIRMED", "IN_PROGRESS"].includes(b.status)).length,
    completed: bookings.filter((b) => b.status === "COMPLETED").length,
    cancelled: bookings.filter((b) => b.status === "CANCELLED").length,
    expired: bookings.filter((b) => b.status === "EXPIRED").length,
  };

  return { bookings, stats };
}

/**
 * Retrieves the bookings for the currently authenticated user.
 * If backend booking endpoints are pending, safely returns empty result with pending flag.
 */
export async function getUserBookings(options = {}) {
  if (!bookingApiConfirmed) {
    return {
      bookings: [],
      stats: { total: 0, active: 0, completed: 0, cancelled: 0 },
      isPendingBackend: true,
    };
  }

  try {
    const response = await sessionRequest(PENDING_BOOKING_ROUTES.LIST_BOOKINGS, { ...options, method: "GET" });
    const normalized = normalizeBookingsResponse(response);
    return { ...normalized, isPendingBackend: false };
  } catch (err) {
    if (err.status === 404) {
      return {
        bookings: [],
        stats: { total: 0, active: 0, completed: 0, cancelled: 0 },
        isPendingBackend: true,
      };
    }
    throw err;
  }
}

const bookingService = {
  status: BOOKING_SERVICE_STATUS,
  pendingRoutes: PENDING_BOOKING_ROUTES,
  isBookingApiAvailable,
  setBookingApiAvailable,
  getUserBookings,
  normalizeBookingsResponse,
};

export default bookingService;

export async function createBooking(body, idempotencyKey) {
  const { data } = await sessionRequest("/bookings", { method: "POST", body,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {} });
  return normalizeBookingsResponse([data.booking]).bookings[0];
}

export async function cancelBooking(id) {
  const { data } = await sessionRequest(`/bookings/${id}/cancel`, { method: "PATCH" });
  return normalizeBookingsResponse([data.booking]).bookings[0];
}

export async function getBooking(id, options = {}) {
  const { data } = await sessionRequest(`/bookings/${encodeURIComponent(id)}`, options);
  return normalizeBookingsResponse([data.booking]).bookings[0];
}

export async function getBookingBill(id, options = {}) {
  const { data } = await sessionRequest(`/bookings/${encodeURIComponent(id)}/bill`, options);
  return data.bill;
}

export async function issueBookingPass(id, purpose) {
  const { data } = await sessionRequest(`/bookings/${encodeURIComponent(id)}/qr`, { method: "POST", body: { purpose } });
  return data;
}
