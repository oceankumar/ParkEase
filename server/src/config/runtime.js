import { signAccessToken } from "../utils/jwt.js";
import { getRefreshTokenTtlMs } from "../utils/cookies.js";
import { qrTTL } from "../services/qrService.js";
import { entryGraceMinutes } from "../services/bookingLifecycle.js";

export function validateRuntime() {
  // Validate auth and worker settings before accepting traffic. Never log secrets.
  signAccessToken({ _id: "000000000000000000000000", role: "USER", status: "ACTIVE" });
  getRefreshTokenTtlMs();
  qrTTL();
  entryGraceMinutes();
  const sweep = Number(process.env.EXPIRY_SWEEP_MS ?? 30000);
  if (!Number.isInteger(sweep) || sweep < 1000) throw new Error("Invalid EXPIRY_SWEEP_MS");
  if (process.env.NODE_ENV === "production") {
    const rawOrigin = process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL;
    if (!rawOrigin) throw new Error("Production requires CLIENT_URL or RENDER_EXTERNAL_URL");
    const url = new URL(rawOrigin);
    if (url.origin !== rawOrigin.replace(/\/$/, "") || url.protocol !== "https:")
      throw new Error("Production frontend origin must be an HTTPS origin without a path");
    if (process.env.VITE_API_URL && process.env.VITE_API_URL !== "/api")
      throw new Error("The combined deployment requires VITE_API_URL=/api");
  }
}
