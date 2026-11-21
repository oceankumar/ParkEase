import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import * as auth from "../services/authService.js";
import AppError from "../utils/AppError.js";
import { clearRefreshCookie, parseCookies, REFRESH_COOKIE_NAME, setRefreshCookie } from "../utils/cookies.js";

export const clientOrigin = (process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5173").replace(/\/$/, "");
const router = Router();
const windowMs = 60_000;

function rateLimit(limit) {
  const buckets = new Map();
  let resetAt = 0;
  return (req, res, next) => {
    const now = Date.now();
    if (now >= resetAt) {
      buckets.clear();
      resetAt = now + windowMs;
    }
    const count = buckets.get(req.ip) ?? 0;
    if (count >= limit || (count === 0 && buckets.size >= 10_000)) {
      res.set("Retry-After", String(Math.ceil((resetAt - now) / 1000)));
      return next(new AppError(429, "Too many requests. Try again shortly.", "RATE_LIMITED"));
    }
    buckets.set(req.ip, count + 1);
    next();
  };
}

function requireCsrf(req, res, next) {
  if (req.get("Origin") !== clientOrigin || req.get("X-Requested-With") !== "XMLHttpRequest") {
    return next(new AppError(403, "Request origin or header is invalid", "CSRF_FAILED"));
  }
  next();
}

const metadata = (req) => ({ createdByIp: req.ip, userAgent: req.get("User-Agent") });
const cookie = (req) => parseCookies(req)[REFRESH_COOKIE_NAME];

function sendSession(res, status, message, { user, accessToken, refreshToken }) {
  setRefreshCookie(res, refreshToken);
  return res.status(status).json({ success: true, message, data: { user, accessToken } });
}

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.post("/register", rateLimit(10), async (req, res) => {
  const result = await auth.register(req.body, metadata(req));
  return sendSession(res, 201, "Account created", result);
});

router.post("/login", rateLimit(15), async (req, res) => {
  const result = await auth.login(req.body, metadata(req));
  return sendSession(res, 200, "Logged in successfully", result);
});

router.post("/refresh", requireCsrf, rateLimit(30), async (req, res) => {
  try {
    const result = await auth.refresh(cookie(req), metadata(req));
    return sendSession(res, 200, "Session refreshed", result);
  } catch (err) {
    if (err.code === "INVALID_SESSION" || err.code === "ACCOUNT_BLOCKED") clearRefreshCookie(res);
    throw err;
  }
});

router.post("/logout", requireCsrf, async (req, res) => {
  await auth.logout(cookie(req));
  clearRefreshCookie(res);
  return res.json({ success: true, message: "Logged out successfully" });
});

router.get("/me", authenticate, (req, res) => {
  res.json({ success: true, message: "Account retrieved", data: { user: req.user } });
});

export default router;
