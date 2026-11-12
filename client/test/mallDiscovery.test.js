import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import MallDiscoveryPage from "../src/pages/MallDiscoveryPage.jsx";
import MallDetailsPage from "../src/pages/MallDetailsPage.jsx";
import mallService, {
  getMalls,
  getMallById,
  normalizeMall,
  normalizeMallsResponse,
  isMallApiAvailable,
  setMallApiAvailable,
  PENDING_MALL_ROUTES,
  MALL_SERVICE_STATUS,
} from "../src/services/mallService.js";

const originalFetch = globalThis.fetch;

test("mallService: contract constants and single mall normalization helper", () => {
  assert.equal(mallService.status, MALL_SERVICE_STATUS);
  assert.equal(PENDING_MALL_ROUTES.LIST_MALLS, "/malls");
  assert.equal(PENDING_MALL_ROUTES.GET_MALL, "/malls/:id");

  // Null input
  assert.equal(normalizeMall(null), null);

  // Complete backend mall record
  const rawItem = {
    _id: "mall_101",
    name: "Phoenix Marketcity",
    address: "LBS Marg, Kurla West",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400070",
    phone: "+91 22 6180 1100",
    email: "info@phoenixmarketcity.com",
    openingTime: "10:00 AM",
    closingTime: "11:00 PM",
    totalSlots: 1500,
    availableSlots: 420,
    floors: ["Basement 1", "Basement 2", "Basement 3"],
    amenities: ["Valet Parking", "EV Charging", "Disabled Parking"],
    status: "ACTIVE",
  };

  const normalized = normalizeMall(rawItem);
  assert.equal(normalized.id, "mall_101");
  assert.equal(normalized.name, "Phoenix Marketcity");
  assert.equal(normalized.location, "Mumbai, Maharashtra");
  assert.equal(normalized.operatingHours, "10:00 AM - 11:00 PM");
  assert.equal(normalized.totalSlots, 1500);
  assert.equal(normalized.availableSlots, 420);
  assert.equal(normalized.contactPhone, "+91 22 6180 1100");
  assert.deepEqual(normalized.floors, ["Basement 1", "Basement 2", "Basement 3"]);
  assert.deepEqual(normalized.amenities, ["Valet Parking", "EV Charging", "Disabled Parking"]);
});

test("mallService: response normalization and dynamic supportedCities extraction", () => {
  const sampleApiResponse = {
    data: [
      {
        id: "m1",
        name: "Palladium Mall",
        city: "Mumbai",
        state: "Maharashtra",
        totalCapacity: 800,
      },
      {
        id: "m2",
        name: "R City Mall",
        city: "Mumbai",
        state: "Maharashtra",
        totalCapacity: 1200,
      },
      {
        id: "m3",
        name: "Elante Mall",
        city: "Chandigarh",
        state: "Punjab",
        totalCapacity: 2000,
      },
    ],
  };

  const res = normalizeMallsResponse(sampleApiResponse);
  assert.equal(res.malls.length, 3);
  assert.equal(res.total, 3);
  // Supported cities extracted dynamically without duplicates
  assert.deepEqual(res.supportedCities, ["Chandigarh", "Mumbai"]);
});

test("mallService: safe absence when backend mall API is pending", async () => {
  setMallApiAvailable(false);
  assert.equal(isMallApiAvailable(), false);

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return {
      ok: false,
      status: 404,
      headers: { get: () => "application/json" },
      json: async () => ({ message: "Not found" }),
    };
  };

  try {
    // 1. getMalls safely returns empty list with pending flag
    const mallsRes = await getMalls();
    assert.equal(mallsRes.isPendingBackend, true);
    assert.deepEqual(mallsRes.malls, []);
    assert.equal(fetchCalled, false, "Should not call fetch when mall API is pending");

    // 2. getMallById safely returns null with pending flag
    const mallRes = await getMallById("m1");
    assert.equal(mallRes.isPendingBackend, true);
    assert.equal(mallRes.mall, null);
    assert.equal(fetchCalled, false, "Should not call fetch for mall details when API is pending");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mallService: API interactions when backend is available", async () => {
  setMallApiAvailable(true);

  let calledUrl = "";
  globalThis.fetch = async (url) => {
    calledUrl = url;
    if (url.includes("/malls/m1")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          data: { id: "m1", name: "Inorbit Mall", city: "Mumbai" },
        }),
      };
    }

    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        data: [{ id: "m1", name: "Inorbit Mall", city: "Mumbai" }],
      }),
    };
  };

  try {
    const listRes = await getMalls({ city: "Mumbai" });
    assert.ok(calledUrl.includes("/malls"));
    assert.ok(calledUrl.includes("city=Mumbai"));
    assert.equal(listRes.malls.length, 1);
    assert.equal(listRes.malls[0].name, "Inorbit Mall");

    const detailRes = await getMallById("m1");
    assert.ok(calledUrl.endsWith("/malls/m1"));
    assert.equal(detailRes.mall.name, "Inorbit Mall");
  } finally {
    globalThis.fetch = originalFetch;
    setMallApiAvailable(false);
  }
});

test("MallDiscoveryPage: renders mall listing with name, location, and action links", () => {
  const sampleMalls = [
    {
      id: "mall-1",
      name: "Phoenix Marketcity",
      address: "LBS Marg, Kurla",
      city: "Mumbai",
      location: "Mumbai, Maharashtra",
      totalSlots: 1500,
      availableSlots: 320,
      operatingHours: "10:00 AM - 11:00 PM",
      status: "ACTIVE",
    },
    {
      id: "mall-2",
      name: "Ambience Mall",
      address: "NH 8",
      city: "Gurugram",
      location: "Gurugram, Haryana",
      totalSlots: 2200,
      status: "ACTIVE",
    },
  ];

  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(MallDiscoveryPage, {
        initialLoading: false,
        initialMalls: sampleMalls,
        initialCities: ["Gurugram", "Mumbai"],
      })
    )
  );

  // Header & Title
  assert.match(html, /Mall Directory &amp; Smart Parking/);
  assert.match(html, /EXPLORE DESTINATIONS/);

  // Mall cards
  assert.match(html, /Phoenix Marketcity/);
  assert.match(html, /LBS Marg, Kurla/);
  assert.match(html, /Capacity: <strong[^>]*>1500<\/strong> bays/);
  assert.match(html, /320 available/);
  assert.match(html, /Open: 10:00 AM - 11:00 PM/);

  // Action links
  assert.match(html, /href="\/malls\/mall-1"/);
  assert.match(html, /View Details ↗/);
  assert.match(html, /Find Parking/);

  // Second mall
  assert.match(html, /Ambience Mall/);
  assert.match(html, /Gurugram/);
});

test("MallDiscoveryPage: search bar and supported city filter rendering", () => {
  const sampleMalls = [
    { id: "m1", name: "R City Mall", city: "Mumbai" },
    { id: "m2", name: "Elante Mall", city: "Chandigarh" },
  ];

  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(MallDiscoveryPage, {
        initialLoading: false,
        initialMalls: sampleMalls,
        initialCities: ["Chandigarh", "Mumbai"],
      })
    )
  );

  // Search input
  assert.match(html, /id="mall-search-input"/);
  assert.match(html, /Search by mall name, area, or address\.\.\./);

  // Supported city select options
  assert.match(html, /id="mall-city-select"/);
  assert.match(html, /value="Mumbai"/);
  assert.match(html, /value="Chandigarh"/);
});

test("MallDiscoveryPage: empty state and pending backend notice", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(MallDiscoveryPage, {
        initialLoading: false,
        initialMalls: [],
        initialCities: [],
      })
    )
  );

  assert.match(html, /Mall Directory Under Construction/);
  assert.match(html, /Sprint 3 Notice/);
  assert.match(html, /Shikhar - Sprint 3/);
});

test("MallDiscoveryPage: renders loading skeletons when data is loading", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(MallDiscoveryPage, {
        initialLoading: true,
      })
    )
  );

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-label="Loading malls directory"/);
  assert.match(html, /skeleton/);
});

test("MallDetailsPage: renders comprehensive mall profile and operating details", () => {
  const sampleMall = {
    id: "phoenix-kurla",
    name: "Phoenix Marketcity (Kurla)",
    address: "Lal Bahadur Shastri Rd, Kamani, Kurla West",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400070",
    location: "Mumbai, Maharashtra",
    operatingHours: "10:30 AM - 11:30 PM",
    totalSlots: 1800,
    availableSlots: 540,
    contactPhone: "+91 22 6180 1100",
    contactEmail: "concierge@phoenixmarketcity.com",
    floors: [
      { name: "Basement 1 (Valet & EV)", level: "B1", slots: 400 },
      { name: "Basement 2 (General)", level: "B2", slots: 800 },
      { name: "Basement 3 (Long-Term)", level: "B3", slots: 600 },
    ],
    amenities: ["EV Fast Charging", "Valet Parking", "Handicapped Accessibility"],
    status: "ACTIVE",
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

  // Mall branding & Header
  assert.match(html, /Phoenix Marketcity \(Kurla\)/);
  assert.match(html, /MALL PROFILE • MUMBAI/);
  assert.match(html, /Live Partner/);

  // Overview metrics
  assert.match(html, /1800 Bays/);
  assert.match(html, /540 Available/);
  assert.match(html, /10:30 AM - 11:30 PM/);

  // Floors breakdown
  assert.match(html, /Basement 1 \(Valet &amp; EV\): 400 bays/);
  assert.match(html, /Basement 2 \(General\): 800 bays/);

  // Amenities
  assert.match(html, /EV Fast Charging/);
  assert.match(html, /Valet Parking/);

  // Address
  assert.match(html, /Lal Bahadur Shastri Rd, Kamani, Kurla West/);

  // Contact info
  assert.match(html, /\+91 22 6180 1100/);
  assert.match(html, /concierge@phoenixmarketcity\.com/);

  // Back button & Actions
  assert.match(html, /← Back to All Malls/);
  assert.match(html, /Find &amp; Reserve Parking/);
});

test("MallDetailsPage: displays safe empty state when mall is not found", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(MallDetailsPage, {
        initialLoading: false,
        initialMall: null,
      })
    )
  );

  assert.match(html, /Mall Profile Not Found/);
  assert.match(html, /Sprint 3 Notice/);
  assert.match(html, /Browse Malls Directory/);
});
