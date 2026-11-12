import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import ParkingAvailabilityPage from "../src/pages/ParkingAvailabilityPage.jsx";
import MallDetailsPage from "../src/pages/MallDetailsPage.jsx";
import parkingService, {
  getParkingAvailability,
  getSlotById,
  normalizeSlot,
  normalizeParkingResponse,
  isParkingApiAvailable,
  setParkingApiAvailable,
  PENDING_PARKING_ROUTES,
  PARKING_SERVICE_STATUS,
  SLOT_STATUS,
} from "../src/services/parkingService.js";

const originalFetch = globalThis.fetch;

test("parkingService: contract constants and single slot normalization helper", () => {
  assert.equal(parkingService.status, PARKING_SERVICE_STATUS);
  assert.equal(PENDING_PARKING_ROUTES.LIST_SLOTS, "/slots");
  assert.equal(PENDING_PARKING_ROUTES.GET_MALL_SLOTS, "/malls/:mallId/slots");
  assert.equal(SLOT_STATUS.AVAILABLE, "AVAILABLE");
  assert.equal(SLOT_STATUS.OCCUPIED, "OCCUPIED");
  assert.equal(SLOT_STATUS.RESERVED, "RESERVED");

  // Null input handling
  assert.equal(normalizeSlot(null), null);

  // Complete backend slot record
  const rawSlot = {
    _id: "slot_001",
    mallId: "mall_101",
    slotCode: "B1-04",
    floor: "B1",
    vehicleType: "CAR",
    status: "AVAILABLE",
    isElectric: true,
    isAccessible: false,
    hourlyRate: 50,
  };

  const normalized = normalizeSlot(rawSlot);
  assert.equal(normalized.id, "slot_001");
  assert.equal(normalized.mallId, "mall_101");
  assert.equal(normalized.slotNumber, "B1-04");
  assert.equal(normalized.floor, "B1");
  assert.equal(normalized.vehicleType, "CAR");
  assert.equal(normalized.status, "AVAILABLE");
  assert.equal(normalized.isElectric, true);
  assert.equal(normalized.isAccessible, false);
  assert.equal(normalized.hourlyRate, 50);
});

test("parkingService: response normalization, summary calculation, and dynamic filter values extraction", () => {
  const sampleApiResponse = {
    slots: [
      {
        id: "s1",
        slotNumber: "B1-01",
        floor: "B1",
        vehicleType: "CAR",
        status: "AVAILABLE",
      },
      {
        id: "s2",
        slotNumber: "B1-02",
        floor: "B1",
        vehicleType: "EV",
        status: "OCCUPIED",
        isElectric: true,
      },
      {
        id: "s3",
        slotNumber: "B2-01",
        floor: "B2",
        vehicleType: "BIKE",
        status: "RESERVED",
      },
      {
        id: "s4",
        slotNumber: "B2-02",
        floor: "B2",
        vehicleType: "CAR",
        status: "AVAILABLE",
        isAccessible: true,
      },
    ],
  };

  const res = normalizeParkingResponse(sampleApiResponse);
  assert.equal(res.slots.length, 4);

  // Computed availability summary strictly from actual records
  assert.notEqual(res.summary, null);
  assert.equal(res.summary.total, 4);
  assert.equal(res.summary.available, 2);
  assert.equal(res.summary.occupied, 1);
  assert.equal(res.summary.reserved, 1);

  // Supported dynamic filter options strictly derived from actual records
  assert.deepEqual(res.supportedFloors, ["B1", "B2"]);
  assert.deepEqual(res.supportedVehicleTypes, ["BIKE", "CAR", "EV"]);
  assert.deepEqual(res.supportedStatuses, ["AVAILABLE", "OCCUPIED", "RESERVED"]);

  // Grouped by floor
  assert.equal(res.slotsByFloor["B1"].length, 2);
  assert.equal(res.slotsByFloor["B2"].length, 2);
});

test("parkingService: safe absence when backend parking API is pending", async () => {
  setParkingApiAvailable(false);
  assert.equal(isParkingApiAvailable(), false);

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({}), { status: 200 });
  };

  try {
    const availabilityResult = await getParkingAvailability("mall_101");
    assert.equal(fetchCalled, false, "fetch should not be called when API is pending");
    assert.equal(availabilityResult.isPendingBackend, true);
    assert.deepEqual(availabilityResult.slots, []);
    assert.equal(availabilityResult.summary, null);

    const slotResult = await getSlotById("slot_101");
    assert.equal(fetchCalled, false);
    assert.equal(slotResult.isPendingBackend, true);
    assert.equal(slotResult.slot, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parkingService: API interactions when backend is available", async () => {
  setParkingApiAvailable(true);

  const mockPayload = {
    slots: [
      {
        _id: "s10",
        slotCode: "G-01",
        floor: "Ground",
        vehicleType: "CAR",
        status: "AVAILABLE",
        hourlyRate: 60,
      },
    ],
  };

  globalThis.fetch = async (url) => {
    assert.match(url.toString(), /\/api\/malls\/mall_test\/slots/);
    return new Response(JSON.stringify(mockPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await getParkingAvailability("mall_test");
    assert.equal(result.isPendingBackend, false);
    assert.equal(result.slots.length, 1);
    assert.equal(result.slots[0].slotNumber, "G-01");
    assert.equal(result.summary.available, 1);
  } finally {
    setParkingApiAvailable(false);
    globalThis.fetch = originalFetch;
  }
});

test("parkingService: handles 404 responses safely without throwing", async () => {
  setParkingApiAvailable(true);

  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ message: "API route not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await getParkingAvailability("non_existent_mall");
    assert.equal(result.isPendingBackend, true);
    assert.deepEqual(result.slots, []);
    assert.equal(result.summary, null);
  } finally {
    setParkingApiAvailable(false);
    globalThis.fetch = originalFetch;
  }
});

test("ParkingAvailabilityPage: renders mall branding, summary cards, and slot grid", () => {
  const sampleMall = {
    id: "phoenix_1",
    name: "Phoenix Marketcity",
    address: "LBS Marg, Kurla West",
    city: "Mumbai",
    status: "ACTIVE",
  };

  const sampleData = {
    slots: [
      {
        id: "s1",
        slotNumber: "B1-01",
        floor: "Basement 1",
        vehicleType: "CAR",
        status: "AVAILABLE",
        hourlyRate: 40,
        isElectric: false,
        isAccessible: false,
      },
      {
        id: "s2",
        slotNumber: "B1-02",
        floor: "Basement 1",
        vehicleType: "EV",
        status: "OCCUPIED",
        hourlyRate: 50,
        isElectric: true,
        isAccessible: false,
      },
      {
        id: "s3",
        slotNumber: "B2-01",
        floor: "Basement 2",
        vehicleType: "CAR",
        status: "RESERVED",
        hourlyRate: 40,
        isElectric: false,
        isAccessible: true,
      },
    ],
    summary: {
      total: 3,
      available: 1,
      occupied: 1,
      reserved: 1,
      maintenance: 0,
    },
    supportedFloors: ["Basement 1", "Basement 2"],
    supportedVehicleTypes: ["CAR", "EV"],
    supportedStatuses: ["AVAILABLE", "OCCUPIED", "RESERVED"],
  };

  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/malls/phoenix_1/parking"] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: "/malls/:id/parking",
          element: React.createElement(ParkingAvailabilityPage, {
            initialLoading: false,
            initialMall: sampleMall,
            initialData: sampleData,
          }),
        })
      )
    )
  );

  // Mall context & Header
  assert.match(html, /Parking Bays at Phoenix Marketcity/);
  assert.match(html, /PARKING AVAILABILITY • MUMBAI/);
  assert.match(html, /LBS Marg, Kurla West/);

  // Summary StatCards rendered with actual counts
  assert.match(html, /Total Capacity/);
  assert.match(html, />3<\/span>/);
  assert.match(html, /Available Bays/);
  assert.match(html, />1<\/span>/);
  assert.match(html, /Occupied Bays/);
  assert.match(html, /Reserved Bays/);

  // Floor groups
  assert.match(html, /Basement 1/);
  assert.match(html, /Basement 2/);

  // Slots rendered
  assert.match(html, /B1-01/);
  assert.match(html, /B1-02/);
  assert.match(html, /B2-01/);

  // Visual status badges
  assert.match(html, /AVAILABLE/);
  assert.match(html, /OCCUPIED/);
  assert.match(html, /RESERVED/);

  // EV & Accessible feature chips
  assert.match(html, /⚡ EV/);
  assert.match(html, /♿ Accessible/);

  // Back button to Mall Details
  assert.match(html, /← Back to Mall Details/);
});

test("ParkingAvailabilityPage: dynamic floor and vehicle filtering controls", () => {
  const sampleMall = { id: "m1", name: "Elante Mall", city: "Chandigarh" };
  const sampleData = {
    slots: [
      { id: "s1", slotNumber: "L1-01", floor: "Level 1", vehicleType: "CAR", status: "AVAILABLE" },
      { id: "s2", slotNumber: "L2-01", floor: "Level 2", vehicleType: "BIKE", status: "AVAILABLE" },
    ],
    summary: { total: 2, available: 2, occupied: 0, reserved: 0 },
    supportedFloors: ["Level 1", "Level 2"],
    supportedVehicleTypes: ["BIKE", "CAR"],
    supportedStatuses: ["AVAILABLE"],
  };

  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(ParkingAvailabilityPage, {
        initialLoading: false,
        initialMall: sampleMall,
        initialData: sampleData,
      })
    )
  );

  // Dynamic filter options generated from backend data
  assert.match(html, /All Floors \(2\)/);
  assert.match(html, /Level 1/);
  assert.match(html, /Level 2/);
  assert.match(html, /All Vehicle Types/);
  assert.match(html, /BIKE/);
  assert.match(html, /CAR/);
  assert.match(html, /Search by bay number/);
});

test("ParkingAvailabilityPage: pending backend safe state without fake statistics", () => {
  const sampleMall = { id: "m2", name: "R City Mall", city: "Mumbai" };

  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(ParkingAvailabilityPage, {
        initialLoading: false,
        initialMall: sampleMall,
        initialData: {
          slots: [],
          summary: null,
          supportedFloors: [],
          supportedVehicleTypes: [],
          supportedStatuses: [],
        },
      })
    )
  );

  // Informative fallback
  assert.match(html, /Parking Availability Unavailable/);
  assert.match(html, /Sprint 3 \/ Sprint 4 Notice/);
  assert.match(html, /Return to Mall Profile/);

  // Verification: No fabricated summary values are rendered
  assert.doesNotMatch(html, /Total Capacity/);
  assert.doesNotMatch(html, /Available Bays/);
});

test("ParkingAvailabilityPage: loading skeleton states", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(ParkingAvailabilityPage, {
        initialLoading: true,
      })
    )
  );

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Loading parking availability/);
});

test("MallDetailsPage: includes navigation link to Parking Availability interface", () => {
  const sampleMall = {
    id: "phoenix-kurla",
    name: "Phoenix Marketcity (Kurla)",
    address: "Lal Bahadur Shastri Rd, Kamani, Kurla West",
    city: "Mumbai",
    status: "ACTIVE",
    totalSlots: 1800,
    availableSlots: 540,
  };

  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/malls/phoenix-kurla"] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: "/malls/:id",
          element: React.createElement(MallDetailsPage, {
            initialLoading: false,
            initialMall: sampleMall,
          }),
        })
      )
    )
  );

  // View Parking Availability action link
  assert.match(html, /View Parking Availability/);
  assert.match(html, /\/malls\/phoenix-kurla\/parking/);

  // Backward compatibility: Find & Reserve Parking action also remains
  assert.match(html, /Find &amp; Reserve Parking/);
});
