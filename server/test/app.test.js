import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import connectDB from "../src/config/db.js";
import errorHandler from "../src/middleware/errorHandler.js";

test("API foundation: health, CORS, 404, malformed JSON, and error privacy", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/api/health`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(health.status, 200);
    assert.equal(
      health.headers.get("access-control-allow-origin"),
      "http://localhost:5173",
    );
    assert.deepEqual(await health.json(), {
      success: true,
      message: "ParkEase API is running",
    });
    const missing = await fetch(`${base}/api/missing`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).success, false);
    const malformed = await fetch(`${base}/api/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).message, "Invalid request body");
    let status;
    let body;
    const response = {
      status(code) {
        status = code;
        return this;
      },
      json(value) {
        body = value;
      },
    };
    errorHandler(
      new Error("private database credentials"),
      {},
      response,
      () => {},
    );
    assert.equal(status, 500);
    assert.deepEqual(body, { success: false, message: "Something went wrong" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("MongoDB configuration rejects missing and unsupported URIs", async () => {
  const original = process.env.MONGODB_URI;
  try {
    delete process.env.MONGODB_URI;
    await assert.rejects(connectDB(), /MONGODB_URI is required/);
    process.env.MONGODB_URI = "https://invalid.example";
    await assert.rejects(connectDB(), /must use mongodb/);
  } finally {
    if (original === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = original;
  }
});
