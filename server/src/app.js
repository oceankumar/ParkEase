import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clientOrigin } from "./routes/authRoutes.js";
import routes from "./routes/index.js";
import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";

const defaultClientDirectory = fileURLToPath(new URL("../../client/dist/", import.meta.url));

export function createApp({ serveClient = process.env.NODE_ENV === "production", clientDirectory = defaultClientDirectory } = {}) {
  const app = express();
  app.disable("x-powered-by");
  // Render terminates TLS at its reverse proxy. Trust only the closest hop.
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.use(cors({ origin: clientOrigin, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  // API misses must remain JSON 404s, never the React HTML fallback.
  app.use("/api", routes, notFound);
  if (serveClient) {
    const indexFile = path.join(clientDirectory, "index.html");
    if (!existsSync(indexFile)) throw new Error("Frontend build is missing. Run npm run build before production startup.");
    app.use(express.static(clientDirectory, { index: false, setHeaders(res, file) {
      res.set("Cache-Control", file.endsWith(".html") ? "no-cache" : file.startsWith(path.join(clientDirectory, "assets") + path.sep)
        ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    } }));
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/assets/") || path.extname(req.path) || !req.accepts("html")) return next();
      res.set("Cache-Control", "no-cache");
      res.sendFile(indexFile);
    });
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();
