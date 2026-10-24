import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";

async function startServer() {
  try {
    await connectDB();
    const port = Number(process.env.PORT || 5000);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("PORT must be an integer from 1 to 65535.");
    const server = app.listen(port);
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
