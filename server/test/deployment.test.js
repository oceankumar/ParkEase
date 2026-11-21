import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { validateRuntime } from "../src/config/runtime.js";

test("Combined deployment serves deep links and cached assets without hiding API or asset failures", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "parkease-production-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, "index.html"), '<!doctype html><div id="root">ParkEase build</div>');
  await writeFile(path.join(directory, "assets", "app-hash.js"), 'document.title="ParkEase";');
  const server = createApp({ serveClient: true, clientDirectory: directory }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of ["/", "/login", "/dashboard/profile", "/dashboard/bookings/reference"]) {
    const response = await fetch(`${base}${route}`, { headers: { Accept: "text/html" } });
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.match(await response.text(), /ParkEase build/);
  }
  const asset = await fetch(`${base}/assets/app-hash.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  assert.match(await asset.text(), /document.title/);
  for (const route of ["/api/unknown", "/assets/unknown.js", "/missing.svg"]) {
    const response = await fetch(`${base}${route}`, { headers: { Accept: "text/html" } });
    assert.equal(response.status, 404, route);
    assert.match(response.headers.get("content-type"), /application\/json/);
  }
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).success, true);
  const nonDocument = await fetch(`${base}/dashboard/profile`, { headers: { Accept: "application/json" } });
  assert.equal(nonDocument.status, 404);
});

test("Production fails clearly when the frontend build is absent", () => {
  assert.throws(() => createApp({ serveClient: true, clientDirectory: "/missing-parkease-build" }), /Frontend build is missing/);
});

test("Production configuration requires a valid HTTPS origin and same-origin API", () => {
  const values = {
    NODE_ENV: "production", CLIENT_URL: "https://parkease.example", RENDER_EXTERNAL_URL: undefined,
    VITE_API_URL: "/api", JWT_ACCESS_SECRET: "deployment-test-secret-at-least-32-characters",
    JWT_ACCESS_EXPIRES_IN: "15m", JWT_REFRESH_EXPIRES_IN: "7d", EXPIRY_SWEEP_MS: "30000",
    QR_TTL_SECONDS: "300", ENTRY_GRACE_MINUTES: "15",
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const set = (key, value) => value === undefined ? delete process.env[key] : process.env[key] = value;
  try {
    for (const [key, value] of Object.entries(values)) set(key, value);
    assert.doesNotThrow(validateRuntime);
    set("CLIENT_URL", undefined); set("RENDER_EXTERNAL_URL", "https://parkease.onrender.com");
    assert.doesNotThrow(validateRuntime);
    set("RENDER_EXTERNAL_URL", undefined);
    assert.throws(validateRuntime, /requires CLIENT_URL/);
    for (const origin of ["http://parkease.example", "https://parkease.example/path", "https://user:password@parkease.example"]) {
      set("CLIENT_URL", origin);
      assert.throws(validateRuntime, /HTTPS origin/);
    }
    set("CLIENT_URL", values.CLIENT_URL); set("VITE_API_URL", "http://localhost:5001/api");
    assert.throws(validateRuntime, /VITE_API_URL/);
    set("VITE_API_URL", "/api"); set("JWT_ACCESS_SECRET", "too-short");
    assert.throws(validateRuntime, /JWT_ACCESS_SECRET/);
    set("JWT_ACCESS_SECRET", values.JWT_ACCESS_SECRET); set("EXPIRY_SWEEP_MS", "0");
    assert.throws(validateRuntime, /EXPIRY_SWEEP_MS/);
  } finally {
    for (const [key, value] of Object.entries(previous)) set(key, value);
  }
});
