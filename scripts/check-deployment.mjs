import assert from "node:assert/strict";

const raw = process.argv[2];
if (!raw) throw new Error("Usage: node scripts/check-deployment.mjs https://your-service.onrender.com");
const origin = new URL(raw).origin;
if (!/^https?:\/\//.test(origin)) throw new Error("Provide an HTTP or HTTPS service URL");
const read = (route, accept = "application/json") => fetch(`${origin}${route}`, { headers: { Accept: accept }, signal: AbortSignal.timeout(90000) });

for (const route of ["/", "/login", "/dashboard/profile", "/dashboard/bookings"]) {
  const response = await read(route, "text/html");
  assert.equal(response.status, 200, `${route} must serve the frontend`);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  const html = await response.text();
  assert.match(html, /id="root"/);
  if (route === "/") {
    const asset = html.match(/<script[^>]+src="([^"\s]+)"/)?.[1];
    assert.ok(asset?.startsWith("/assets/"), "Expected the built Vite script");
    const script = await read(asset, "*/*");
    assert.equal(script.status, 200, "The production JavaScript must be reachable");
    assert.doesNotMatch(script.headers.get("content-type") || "", /text\/html/);
  }
}
for (const route of ["/api/health", "/api/health/ready"]) {
  const response = await read(route);
  assert.equal(response.status, 200, `${route} must be healthy`);
  const payload = await response.json();
  assert.equal(payload.success, true);
  if (route.endsWith("/ready")) {
    assert.equal(payload.data.database, "ready");
    assert.equal(payload.data.expiryWorker.started, true, "Expiry worker must be started");
  }
}
for (const route of ["/api/__deployment_check_missing__", "/assets/__deployment_check_missing__.js"]) {
  const response = await read(route, "text/html");
  assert.equal(response.status, 404, `${route} must not fall through to the SPA`);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
}
console.log(`Deployment checks passed: ${origin}`);
