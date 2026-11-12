import apiClient from "./api.js";

/**
 * Parking Slot & Real-time Availability Service (Sprint 3 / Sprint 4 Milestone)
 *
 * BACKEND STATUS: PENDING IMPLEMENTATION
 * Live backend endpoints are currently pending implementation by Shikhar (Sprint 3) & Mehak (Sprint 4):
 * - GET /api/malls/:mallId/slots (Mall parking slot inventory and real-time availability)
 * - GET /api/malls/:mallId/availability (Mall parking summary telemetry)
 * - GET /api/slots (Global slot directory query)
 * - GET /api/slots/:id (Individual slot details)
 * - PATCH /api/slots/:id (Slot status update by guards/sensors)
 *
 * Safe absence handling:
 * Unconfirmed endpoints are handled safely. If backend slot endpoints return 404 or
 * are pending, the service returns safe defaults ({ slots: [], summary: null }) or surfaces
 * status for friendly UI empty/unavailable states without fake data or hardcoded slots.
 */

export const PARKING_SERVICE_STATUS = "PENDING_BACKEND_IMPLEMENTATION";

export const PENDING_PARKING_ROUTES = Object.freeze({
  LIST_SLOTS: "/slots",
  GET_SLOT: "/slots/:id",
  GET_MALL_SLOTS: "/malls/:mallId/slots",
  GET_MALL_AVAILABILITY: "/malls/:mallId/availability",
  UPDATE_SLOT: "/slots/:id",
});

export const SLOT_STATUS = Object.freeze({
  AVAILABLE: "AVAILABLE",
  OCCUPIED: "OCCUPIED",
  RESERVED: "RESERVED",
  MAINTENANCE: "MAINTENANCE",
});

let parkingApiConfirmed = false;

export function isParkingApiAvailable() {
  return parkingApiConfirmed;
}

export function setParkingApiAvailable(available) {
  parkingApiConfirmed = Boolean(available);
}

/**
 * Normalizes a single slot record from raw backend response.
 * Preserves all backend fields without inventing unconfirmed mock data.
 */
export function normalizeSlot(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const id = item._id || item.id || "";
  const slotNumber =
    item.slotNumber || item.slotCode || item.code || item.identifier || item.name || id || "Unknown";
  const floor = item.floor || item.level || item.floorLevel || item.deck || "";
  const vehicleType = (item.vehicleType || item.type || item.slotType || "CAR").toUpperCase();
  const status = String(item.status || SLOT_STATUS.AVAILABLE).toUpperCase();
  const mallId =
    item.mallId ||
    item.mall?._id ||
    item.mall?.id ||
    (typeof item.mall === "string" ? item.mall : "");

  return {
    id,
    mallId,
    slotNumber,
    floor: String(floor),
    vehicleType,
    status,
    isElectric: Boolean(item.isElectric || item.isEV || item.hasEVCharging || item.evCharging),
    isAccessible: Boolean(item.isAccessible || item.handicap || item.disability),
    hourlyRate:
      typeof item.hourlyRate === "number"
        ? item.hourlyRate
        : typeof item.rate === "number"
          ? item.rate
          : null,
    lastUpdated: item.lastUpdated || item.updatedAt || null,
    raw: item,
  };
}

/**
 * Normalizes a list of parking slots returned by the backend.
 * Groups slots by floor and extracts supported filter values strictly from actual records.
 */
export function normalizeParkingResponse(response) {
  if (!response || typeof response !== "object") {
    return {
      slots: [],
      summary: null,
      supportedFloors: [],
      supportedVehicleTypes: [],
      supportedStatuses: [],
      slotsByFloor: {},
    };
  }

  const rawList = Array.isArray(response)
    ? response
    : Array.isArray(response.data)
      ? response.data
      : Array.isArray(response.slots)
        ? response.slots
        : Array.isArray(response.data?.slots)
          ? response.data.slots
          : [];

  const slots = rawList.map(normalizeSlot).filter(Boolean);

  // Group slots by floor when floor data is present
  const slotsByFloor = {};
  slots.forEach((slot) => {
    const floorKey = slot.floor || "General";
    if (!slotsByFloor[floorKey]) {
      slotsByFloor[floorKey] = [];
    }
    slotsByFloor[floorKey].push(slot);
  });

  // Extract supported dynamic filter options strictly from returned data
  const supportedFloors = [...new Set(slots.map((s) => s.floor).filter(Boolean))].sort();
  const supportedVehicleTypes = [...new Set(slots.map((s) => s.vehicleType).filter(Boolean))].sort();
  const supportedStatuses = [...new Set(slots.map((s) => s.status).filter(Boolean))].sort();

  // Summary: only compute/provide when actual data exists
  let summary = null;
  if (response.summary && typeof response.summary === "object") {
    summary = {
      total: typeof response.summary.total === "number" ? response.summary.total : slots.length,
      available: typeof response.summary.available === "number" ? response.summary.available : 0,
      occupied: typeof response.summary.occupied === "number" ? response.summary.occupied : 0,
      reserved: typeof response.summary.reserved === "number" ? response.summary.reserved : 0,
      maintenance: typeof response.summary.maintenance === "number" ? response.summary.maintenance : 0,
    };
  } else if (slots.length > 0) {
    summary = {
      total: slots.length,
      available: slots.filter((s) => s.status === SLOT_STATUS.AVAILABLE).length,
      occupied: slots.filter((s) => s.status === SLOT_STATUS.OCCUPIED).length,
      reserved: slots.filter((s) => s.status === SLOT_STATUS.RESERVED).length,
      maintenance: slots.filter((s) => s.status === SLOT_STATUS.MAINTENANCE).length,
    };
  }

  return {
    slots,
    summary,
    supportedFloors,
    supportedVehicleTypes,
    supportedStatuses,
    slotsByFloor,
  };
}

/**
 * Retrieves the parking availability and slots for a given mall.
 */
export async function getParkingAvailability(mallId, params = {}, options = {}) {
  if (!parkingApiConfirmed) {
    return {
      slots: [],
      summary: null,
      supportedFloors: [],
      supportedVehicleTypes: [],
      supportedStatuses: [],
      slotsByFloor: {},
      isPendingBackend: true,
    };
  }

  try {
    const endpoint = mallId
      ? PENDING_PARKING_ROUTES.GET_MALL_SLOTS.replace(":mallId", encodeURIComponent(mallId))
      : PENDING_PARKING_ROUTES.LIST_SLOTS;

    const response = await apiClient.get(endpoint, {
      params: mallId ? params : { mallId, ...params },
      ...options,
    });
    const normalized = normalizeParkingResponse(response);
    return { ...normalized, isPendingBackend: false };
  } catch (err) {
    if (err.status === 404) {
      return {
        slots: [],
        summary: null,
        supportedFloors: [],
        supportedVehicleTypes: [],
        supportedStatuses: [],
        slotsByFloor: {},
        isPendingBackend: true,
      };
    }
    throw err;
  }
}

/**
 * Retrieves detailed information for a single parking slot by ID.
 */
export async function getSlotById(id, options = {}) {
  if (!id) {
    return { slot: null, isPendingBackend: false };
  }

  if (!parkingApiConfirmed) {
    return {
      slot: null,
      isPendingBackend: true,
    };
  }

  try {
    const endpoint = PENDING_PARKING_ROUTES.GET_SLOT.replace(":id", encodeURIComponent(id));
    const response = await apiClient.get(endpoint, options);
    const rawSlot = response && response.data ? response.data : response;
    const slot = normalizeSlot(rawSlot);
    return { slot, isPendingBackend: false };
  } catch (err) {
    if (err.status === 404) {
      return {
        slot: null,
        isPendingBackend: true,
      };
    }
    throw err;
  }
}

const parkingService = {
  status: PARKING_SERVICE_STATUS,
  pendingRoutes: PENDING_PARKING_ROUTES,
  slotStatus: SLOT_STATUS,
  isParkingApiAvailable,
  setParkingApiAvailable,
  normalizeSlot,
  normalizeParkingResponse,
  getParkingAvailability,
  getSlotById,
};

export default parkingService;
