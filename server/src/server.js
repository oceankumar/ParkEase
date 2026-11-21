import "./config/env.js";
import app from "./app.js";
import connectDB from "./config/db.js";
import mongoose from "mongoose";
import { startExpiryWorker, stopExpiryWorker } from "./services/expiryService.js";
import { validateRuntime } from "./config/runtime.js";

async function startServer() {
  try {
    validateRuntime();
    await connectDB();
    const port = Number(process.env.PORT || 5000);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("PORT must be an integer from 1 to 65535.");
    const server = app.listen(port, "0.0.0.0");
    startExpiryWorker();
    let shutdownPromise;
    const shutdown = () => {
      shutdownPromise ??= (async () => {
        // Stop scheduling work immediately, but let an in-flight sweep finish
        // while the HTTP server drains existing requests.
        const workerStop = stopExpiryWorker();
        await Promise.all([
          new Promise((resolve, reject) =>
            server.close((error) => error ? reject(error) : resolve()),
          ),
          workerStop,
        ]);
        await mongoose.disconnect();
      })();
      return shutdownPromise;
    };
    const onSignal = () => shutdown().then(() => process.exit(0)).catch(() => process.exit(1));
    process.once("SIGTERM", onSignal);
    process.once("SIGINT", onSignal);
    server.on("listening", () =>
      console.log(`ParkEase API listening on http://localhost:${port}`),
    );
    server.on("error", () => {
      console.error(
        "Server could not listen. Check PORT and whether it is already in use.",
      );
      process.exit(1);
    });
  } catch {
    // Do not print connection details because they may contain credentials.
    console.error(
      "Startup failed. Check PORT, MONGODB_URI, and MongoDB availability.",
    );
    process.exit(1);
  }
}
startServer();
