import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import mongoose from "mongoose";
import app from "../src/app.js";
import Booking from "../src/models/Booking.js";
import Mall from "../src/models/Mall.js";
import User from "../src/models/User.js";
import RefreshToken from "../src/models/RefreshToken.js";
import { hashToken, signAccessToken } from "../src/utils/jwt.js";

const origin = process.env.CLIENT_URL || "http://localhost:5173";
const csrf = { Origin: origin, "X-Requested-With": "XMLHttpRequest" };
const account = { name: "Parking User", email: "Driver@Example.test", password: "test-password" };

async function serve(t) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return (path, { body, headers = {}, method = "POST", area = "auth" } = {}) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/${area}/${path}`, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: JSON.stringify(body),
    });
}

function readCookie(response) {
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /^parkease_refresh_token=[a-f0-9]{64};/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Path=\/api\/auth/);
  return cookie.split(";")[0];
}

test("auth lifecycle on MongoDB", { skip: !process.env.AUTH_TEST_MONGODB_URI && "Set AUTH_TEST_MONGODB_URI to an isolated replica set" }, async (t) => {
  process.env.JWT_ACCESS_SECRET = randomUUID() + randomUUID();
  process.env.BCRYPT_SALT_ROUNDS = "4";
  await mongoose.connect(process.env.AUTH_TEST_MONGODB_URI, {
    dbName: `parkease_auth_test_${randomUUID().replaceAll("-", "")}`,
    serverSelectionTimeoutMS: 5000,
  });
  t.after(async () => {
    try {
      await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  await Promise.all([User.init(), RefreshToken.init(), Mall.init(), Booking.init()]);
  const request = await serve(t);
  const register = (body) => request("register", { body });
  const login = (body = account) => request("login", { body, headers: { "User-Agent": "integration-test" } });
  const refresh = (Cookie) => request("refresh", { headers: { ...csrf, Cookie } });
  const logout = (Cookie) => request("logout", { headers: { ...csrf, Cookie } });
  const me = (token) => request("me", { method: "GET", headers: { Authorization: `Bearer ${token}` } });

  const signup = await register({ ...account, status: "SUSPENDED" });
  assert.equal(signup.status, 201);
  const firstCookie = readCookie(signup);
  const { data } = await signup.json();
  assert.equal(data.user.email, account.email.toLowerCase());
  assert.equal(data.user.role, "USER");
  assert.equal(data.user.status, "ACTIVE");
  assert.equal(data.user.passwordHash, undefined);
  assert.equal(data.refreshToken, undefined);
  assert.equal((await register(account)).status, 409);

  const owner = await register({ ...account, email: "owner@example.test", role: "MALL_OWNER" });
  assert.equal(owner.status, 201);
  const ownerData = (await owner.json()).data;
  assert.equal(ownerData.user.status, "PENDING_APPROVAL");
  assert.equal((await me(ownerData.accessToken)).status, 200);

  assert.equal((await login({ ...account, password: "wrong-password" })).status, 401);
  assert.equal((await login({ ...account, email: "unknown@example.test" })).status, 401);
  const signedIn = await login();
  assert.equal(signedIn.status, 200);
  const loginCookie = readCookie(signedIn);
  const originalHash = hashToken(loginCookie.split("=")[1]);
  const stored = await RefreshToken.findOne({ tokenHash: originalHash });
  assert.equal(stored.userAgent, "integration-test");
  assert.equal((await me(data.accessToken)).status, 200);

  const attempts = await Promise.all([refresh(loginCookie), refresh(loginCookie)]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 401]);
  const rotatedCookie = readCookie(attempts.find((r) => r.status === 200));
  assert.notEqual(rotatedCookie, loginCookie);
  assert.equal((await refresh(rotatedCookie)).status, 401);
  assert.equal(await RefreshToken.countDocuments({ familyId: stored.familyId, revokedAt: null }), 0);

  const completed = await logout(firstCookie);
  assert.equal(completed.status, 200);
  assert.match(completed.headers.get("set-cookie"), /^parkease_refresh_token=;/);
  assert.equal((await logout(firstCookie)).status, 200);
  assert.equal((await refresh(firstCookie)).status, 401);

  const expiringCookie = readCookie(await login());
  await RefreshToken.updateOne({ tokenHash: hashToken(expiringCookie.split("=")[1]) }, { expiresAt: new Date(0) });
  assert.equal((await refresh(expiringCookie)).status, 401);

  await t.test("Admin bootstrap and owner approval enforce live permissions", async (adminTest) => {
    const seedUri = new URL(process.env.AUTH_TEST_MONGODB_URI);
    seedUri.pathname = `/${mongoose.connection.name}`;
    const admin = { email: "admin@example.test", password: randomUUID() };
    const seed = (email = admin.email, password = admin.password) =>
      promisify(execFile)(process.execPath, [fileURLToPath(new URL("../src/scripts/seedAdmin.js", import.meta.url))], {
        env: { ...process.env, MONGODB_URI: seedUri.href, ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ADMIN_NAME: "Test Admin" },
      });
    await assert.rejects(seed(account.email), (err) => err.code === 1 && /non-admin/.test(err.stderr));
    await assert.rejects(seed(admin.email, "replace-with-a-strong-password"), (err) => err.code === 1 && /ADMIN_PASSWORD/.test(err.stderr));
    await seed();
    await seed(admin.email, randomUUID());
    await seed("different-admin@example.test");
    assert.equal(await User.countDocuments({ role: "ADMIN" }), 1);

    const adminLogin = await login(admin);
    assert.equal(adminLogin.status, 200);
    const { data: adminData } = await adminLogin.json();
    await adminTest.test("Team frontend service restores an admin session and signs out", async (clientTest) => {
      const client = await import("../../client/src/services/authService.js");
      const fetchFromServer = globalThis.fetch;
      const apiOrigin = new URL(process.env.VITE_API_URL || "http://localhost:5001/api").origin;
      let activeCookie = readCookie(adminLogin);
      clientTest.mock.method(globalThis, "fetch", async (url, options) => {
        const target = new URL(url);
        if (target.origin !== apiOrigin) return fetchFromServer(url, options);
        const match = /^\/api\/([^/]+)\/(.*)$/.exec(target.pathname);
        assert.ok(match);
        assert.equal(options.credentials, "include");
        const response = await request(match[2] + target.search, {
          area: match[1],
          method: options.method || "GET",
          body: options.body ? JSON.parse(options.body) : undefined,
          headers: { ...options.headers, Origin: origin, Cookie: activeCookie },
        });
        if (target.pathname.endsWith("/refresh") && response.ok) activeCookie = readCookie(response);
        return response;
      });
      await client.restoreSession();
      assert.equal(client.getSession().user.role, "ADMIN");
      const { data: pending } = await client.sessionRequest("/admin/mall-owners", {
        params: { status: "PENDING_APPROVAL" },
      });
      assert.deepEqual(pending.mallOwners.map((user) => user._id), [ownerData.user._id]);
      await client.signOut();
      assert.equal(client.getSession().user, null);
      assert.equal((await refresh(activeCookie)).status, 401);
    });

    const adminRequest = (path, token, body) => request(path, {
      area: "admin",
      method: body ? "PATCH" : "GET",
      body,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const list = (token) => adminRequest("mall-owners?status=PENDING_APPROVAL", token);
    const update = (id, status, extra) => adminRequest(`mall-owners/${id}/status`, adminData.accessToken, { status, ...extra });
    assert.equal((await list()).status, 401);
    assert.equal((await list(data.accessToken)).status, 403);
    assert.equal((await list(ownerData.accessToken)).status, 403);

    const pending = await list(adminData.accessToken);
    assert.equal(pending.status, 200);
    assert.deepEqual((await pending.json()).data.mallOwners.map((user) => user._id), [ownerData.user._id]);
    assert.equal((await update(data.user._id, "ACTIVE")).status, 404);
    assert.equal((await update(ownerData.user._id, "SUSPENDED")).status, 409);

    const mallDetails = { name: "City Centre", city: "Delhi", address: "25 Main Road", hourlyRatePaise: 5050 };
    const mallRequest = (path, token, body) => request(path, {
      area: "malls",
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    assert.equal((await mallRequest("", ownerData.accessToken, mallDetails)).status, 403);
    assert.equal((await mallRequest("", data.accessToken, mallDetails)).status, 403);
    assert.equal((await mallRequest("owner/my-malls", ownerData.accessToken)).status, 403);

    const approval = await update(ownerData.user._id, "ACTIVE", { approvedBy: data.user._id });
    assert.equal(approval.status, 200);
    const { user: approved } = (await approval.json()).data;
    assert.equal(approved.approvedBy, adminData.user._id);
    assert.ok(approved.approvedAt);
    assert.equal((await (await me(ownerData.accessToken)).json()).data.user.status, "ACTIVE");
    await adminTest.test("Mall submission, review, and public visibility enforce permissions", async () => {
      const created = await mallRequest("", ownerData.accessToken, {
        ...mallDetails,
        ownerId: adminData.user._id,
        status: "APPROVED",
      });
      assert.equal(created.status, 201);
      const { data: { mall } } = await created.json();
      assert.equal(mall.status, "PENDING");
      assert.equal(mall.ownerId, ownerData.user._id);
      assert.equal(mall.hourlyRatePaise, 5050);
      assert.equal(mall.openingTime, "08:00");
      assert.equal((await mallRequest("", ownerData.accessToken, mallDetails)).status, 409);
      assert.equal((await mallRequest("", ownerData.accessToken, { ...mallDetails, hourlyRatePaise: 1.5 })).status, 400);
      assert.equal((await mallRequest("", ownerData.accessToken, { ...mallDetails, hourlyRatePaise: -1 })).status, 400);
      assert.equal((await mallRequest("", ownerData.accessToken, { ...mallDetails, openingTime: "24:00" })).status, 400);

      const otherOwner = await User.create({
        name: "Another Owner", email: "other-owner@example.test",
        role: "MALL_OWNER", status: "ACTIVE", passwordHash: "unused-test-fixture",
      });
      const otherToken = signAccessToken(otherOwner);
      const own = await mallRequest("owner/my-malls?ownerId=" + otherOwner.id, ownerData.accessToken);
      const other = await mallRequest("owner/my-malls?ownerId=" + mall.ownerId, otherToken);
      assert.deepEqual((await own.json()).data.malls.map((item) => item._id), [mall._id]);
      assert.deepEqual((await other.json()).data.malls, []);

      const publicRead = (path = "") => request(path, { area: "malls", method: "GET" });
      const review = (mallId, body, token = adminData.accessToken) => adminRequest(`malls/${mallId}/status`, token, body);
      assert.deepEqual((await (await publicRead()).json()).data.malls, []);
      assert.equal((await publicRead(mall._id)).status, 404);
      assert.equal((await review(mall._id, { status: "APPROVED" }, ownerData.accessToken)).status, 403);
      const queue = await adminRequest("malls?status=PENDING", adminData.accessToken);
      assert.deepEqual((await queue.json()).data.malls.map((item) => item._id), [mall._id]);

      const reviewed = await review(mall._id, { status: "APPROVED" });
      assert.equal(reviewed.status, 200);
      const approvedMall = (await reviewed.json()).data.mall;
      assert.equal(approvedMall.approvedBy, adminData.user._id);
      assert.ok(approvedMall.approvedAt);
      assert.equal((await review(mall._id, { status: "APPROVED" })).status, 409);

      const listed = await publicRead("?city=delhi&search=city");
      const { malls: publicMalls, total } = (await listed.json()).data;
      assert.equal(total, 1);
      assert.equal(publicMalls[0]._id, mall._id);
      assert.equal(publicMalls[0].ownerId, undefined);
      assert.equal(publicMalls[0].approvedBy, undefined);
      const mallService = await import("../../client/src/services/mallService.js");
      const normalized = mallService.normalizeMallsResponse({ data: { malls: publicMalls, total } });
      assert.equal(normalized.malls[0].hourlyRatePaise, 5050);
      assert.equal(normalized.malls[0].id, mall._id);
      assert.deepEqual((await (await publicRead("?search=.*")).json()).data.malls, []);
      assert.deepEqual((await (await publicRead("?city=Del")).json()).data.malls, []);
      assert.equal((await publicRead("?city=Delhi&city=Noida")).status, 400);
      assert.equal((await (await publicRead(mall._id)).json()).data.mall.status, "APPROVED");

      const inventory = `${mall._id}/inventory`;
      const inventoryRequest = (path = "", method = "GET", body, token = ownerData.accessToken) =>
        request(inventory + path, { area: "malls", method, body, headers: { Authorization: `Bearer ${token}` } });
      const bay = { id: randomUUID(), code: "A01", vehicleType: "CAR" };
      const layout = { floors: [{ name: "B1", rows: [[bay, null]] }] };
      assert.equal((await inventoryRequest("", "GET", undefined, otherToken)).status, 404);
      assert.equal((await inventoryRequest("/draft", "PUT", { revision: 0, layout })).status, 200);
      assert.deepEqual((await (await publicRead(`${mall._id}/slots`)).json()).data.slots, []);
      const duplicate = { floors: [{ name: "B1", rows: [[bay, { ...bay, id: randomUUID(), code: "a01" }]] }] };
      assert.equal((await inventoryRequest("/published", "PUT", { revision: 1, layout: duplicate })).status, 400);
      assert.equal((await inventoryRequest("/published", "PUT", { revision: 0, layout })).status, 409);
      assert.equal((await inventoryRequest("/published", "PUT", { revision: 1, layout })).status, 200);
      const publicSlots = async () => (await (await publicRead(`${mall._id}/slots`)).json()).data;
      assert.equal((await publicSlots()).slots[0].status, "AVAILABLE");
      assert.deepEqual((await publicSlots()).layout[0].rows, [[bay.id, null]]);
      assert.equal((await inventoryRequest(`/bays/${bay.id}`, "PATCH", { revision: 2, status: "MAINTENANCE" })).status, 200);
      assert.equal((await inventoryRequest("/published", "PUT", { revision: 3, layout })).status, 200);
      assert.equal((await publicSlots()).slots[0].status, "MAINTENANCE");
      assert.equal((await inventoryRequest(`/bays/${bay.id}`, "PATCH", { revision: 4, status: "AVAILABLE" })).status, 200);
      assert.equal((await publicSlots()).slots[0].status, "AVAILABLE");

      const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const timestamp = (time) => new Date(`${date}T${time}:00+05:30`).toISOString();
      const window = { startTime: timestamp("11:00"), endTime: timestamp("12:30") };
      const book = (path, method, body, token = data.accessToken) => request(path, {
        area: "bookings", method, body, headers: { Authorization: `Bearer ${token}` },
      });
      const body = { ...window, mallId: mall._id, bayId: bay.id, vehicleType: "CAR", vehicleNumber: "up32 ab 1234" };
      assert.equal((await book("", "POST", body, ownerData.accessToken)).status, 403);
      assert.equal((await book("", "POST", { ...body, vehicleType: "BIKE" })).status, 409);
      assert.equal((await book("", "POST", { ...body, startTime: timestamp("06:00"), endTime: timestamp("07:00") })).status, 400);
      const attempts = await Promise.all([book("", "POST", body), book("", "POST", body)]);
      assert.deepEqual(attempts.map((response) => response.status).sort(), [201, 409]);
      const { booking } = (await attempts.find((response) => response.status === 201).json()).data;
      assert.equal(booking.totalAmountPaise, 7575);
      assert.equal(booking.vehicleNumber, "UP32 AB 1234");
      assert.equal(booking.canCancel, true);
      const timeLookup = `${mall._id}/slots?${new URLSearchParams(window)}`;
      const reservedSlot = (await (await publicRead(timeLookup)).json()).data.slots[0];
      assert.equal(reservedSlot.status, "RESERVED");
      assert.equal(reservedSlot.vehicleNumber, undefined);
      assert.equal((await publicSlots()).slots[0].status, "AVAILABLE");
      assert.equal((await inventoryRequest(`/bays/${bay.id}`, "PATCH", { revision: 5, status: "MAINTENANCE" })).status, 409);
      const adjacent = await book("", "POST", { ...body, startTime: timestamp("12:30"), endTime: timestamp("13:30") });
      assert.equal(adjacent.status, 201);
      const adjacentId = (await adjacent.json()).data.booking._id;
      assert.equal((await (await book("", "GET")).json()).data.bookings.length, 2);
      const secondDriver = await register({ ...account, email: "other-driver@example.test" });
      const secondDriverToken = (await secondDriver.json()).data.accessToken;
      assert.deepEqual((await (await book("", "GET", undefined, secondDriverToken)).json()).data.bookings, []);
      assert.equal((await book(`${booking._id}/cancel`, "PATCH", undefined, secondDriverToken)).status, 404);
      assert.equal((await book(`${booking._id}/cancel`, "PATCH")).status, 200);
      assert.equal((await book(`${booking._id}/cancel`, "PATCH")).status, 200);
      assert.equal((await (await publicRead(timeLookup)).json()).data.slots[0].status, "AVAILABLE");
      assert.equal((await (await publicRead(`${mall._id}/slots?view=reservations`)).json()).data.slots[0].status, "RESERVED", "The adjacent booking still holds the bay in the overview");
      assert.equal((await book(`${adjacentId}/cancel`, "PATCH")).status, 200);
      assert.equal((await (await publicRead(`${mall._id}/slots?view=reservations`)).json()).data.slots[0].status, "AVAILABLE", "Cancelling all reservations releases the overview bay");

      const rejectedMall = await mallRequest("", ownerData.accessToken, { ...mallDetails, name: "Other Mall" });
      const rejectedId = (await rejectedMall.json()).data.mall._id;
      assert.equal((await review(rejectedId, { status: "REJECTED" })).status, 400);
      const rejection = await review(rejectedId, { status: "REJECTED", rejectionReason: "  Verify address  " });
      assert.equal((await rejection.json()).data.mall.rejectionReason, "Verify address");
      assert.equal((await publicRead(rejectedId)).status, 404);

      assert.equal((await review(mall._id, { status: "INACTIVE" })).status, 200);
      assert.equal((await publicRead(mall._id)).status, 404);
      assert.deepEqual((await (await publicRead()).json()).data.malls, []);
      assert.equal((await publicRead(`${mall._id}/slots`)).status, 404);
    });

    assert.equal((await update(ownerData.user._id, "SUSPENDED")).status, 200);
    assert.equal((await me(ownerData.accessToken)).status, 403);
    assert.equal((await mallRequest("owner/my-malls", ownerData.accessToken)).status, 403);
    assert.equal((await refresh(readCookie(owner))).status, 403);

    const secondOwner = await register({ ...account, email: "second-owner@example.test", role: "MALL_OWNER" });
    assert.equal(secondOwner.status, 201);
    const secondId = (await secondOwner.json()).data.user._id;
    assert.equal((await update(secondId, "REJECTED")).status, 400);
    const rejected = await update(secondId, "REJECTED", { rejectionReason: "  Incomplete details  " });
    assert.equal(rejected.status, 200);
    assert.equal((await rejected.json()).data.user.rejectionReason, "Incomplete details");
    assert.equal((await update(secondId, "ACTIVE")).status, 409);

    await User.updateOne({ _id: adminData.user._id }, { role: "USER" });
    assert.equal((await list(adminData.accessToken)).status, 403);
  });

  await User.updateOne({ _id: data.user._id }, { role: "MALL_OWNER" });
  assert.equal((await (await me(data.accessToken)).json()).data.user.role, "MALL_OWNER");
  await User.updateOne({ _id: data.user._id }, { status: "SUSPENDED" });
  assert.equal((await me(data.accessToken)).status, 403);
  assert.equal((await login()).status, 403);
});

test("auth rejects privileged registration and cross-origin cookie operations before database access", async (t) => {
  const request = await serve(t);
  assert.equal((await request("mall-owners", { area: "admin", method: "GET" })).status, 401);
  for (const role of ["ADMIN", "GUARD"]) {
    const response = await request("register", { body: { ...account, role } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_ROLE");
  }
  for (const action of ["refresh", "logout"]) {
    for (const headers of [{ Origin: origin }, { ...csrf, Origin: "https://wrong.example" }]) {
      assert.equal((await request(action, { headers })).status, 403);
    }
  }
  const preflight = await request("login", {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
  });
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
  let limited = await request("login", { body: {} });
  for (let i = 0; i < 15 && limited.status === 400; i += 1) {
    limited = await request("login", { body: {} });
  }
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
});
