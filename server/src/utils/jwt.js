import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import ROLES from "../constants/roles.js";
import { USER_STATUS } from "../constants/statuses.js";
import AppError from "./AppError.js";

const DEFAULT_ACCESS_EXPIRES_IN = "15m";
const MIN_ACCESS_SECRET_BYTES = 32;
const PLACEHOLDER_SECRETS = new Set([
  "replace-with-a-random-32-byte-secret",
  "replace-with-a-strong-random-secret",
  "replace-with-32-byte-hex-access-secret",
  "replace-with-at-least-32-byte-random-hex-secret",
]);
const REFRESH_TOKEN_BYTES = 32;

function getAccessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (typeof secret !== "string") {
    throw new AppError(
      500,
      "JWT_ACCESS_SECRET is missing or invalid",
      "CONFIG_ERROR",
    );
  }
  const trimmed = secret.trim();
  if (
    Buffer.byteLength(trimmed, "utf8") < MIN_ACCESS_SECRET_BYTES ||
    PLACEHOLDER_SECRETS.has(trimmed)
  ) {
    throw new AppError(
      500,
      "JWT_ACCESS_SECRET must be at least 32 bytes and not a placeholder value",
      "CONFIG_ERROR",
    );
  }
  return secret;
}

export function signAccessToken(user) {
  const secret = getAccessSecret();
  if (!user || typeof user !== "object") {
    throw new AppError(
      400,
      "User object is required to sign access token",
      "INVALID_TOKEN_PAYLOAD",
    );
  }

  const userId = user._id ?? user.id;
  if (!userId || String(userId).trim().length === 0) {
    throw new AppError(
      400,
      "User id is required to sign access token",
      "INVALID_TOKEN_PAYLOAD",
    );
  }

  if (!Object.values(ROLES).includes(user.role)) {
    throw new AppError(
      400,
      "Valid user role is required to sign access token",
      "INVALID_TOKEN_PAYLOAD",
    );
  }

  if (!Object.values(USER_STATUS).includes(user.status)) {
    throw new AppError(
      400,
      "Valid user status is required to sign access token",
      "INVALID_TOKEN_PAYLOAD",
    );
  }

  const expiresIn =
    process.env.JWT_ACCESS_EXPIRES_IN?.trim() || DEFAULT_ACCESS_EXPIRES_IN;

  return jwt.sign(
    {
      role: user.role,
      status: user.status,
      sessionVersion: user.sessionVersion ?? 0,
    },
    secret,
    {
      algorithm: "HS256",
      subject: String(userId),
      expiresIn,
    },
  );
}

export function verifyAccessToken(token) {
  const secret = getAccessSecret();
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new AppError(401, "Access token is required", "TOKEN_MISSING");
  }

  try {
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (
      !decoded ||
      typeof decoded !== "object" ||
      typeof decoded.sub !== "string" ||
      !decoded.sub.trim() ||
      !Object.values(ROLES).includes(decoded.role) ||
      !Object.values(USER_STATUS).includes(decoded.status)
    ) {
      throw new AppError(
        401,
        "Invalid access token payload",
        "INVALID_TOKEN",
      );
    }
    return decoded;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    if (err?.name === "TokenExpiredError") {
      throw new AppError(401, "Access token has expired", "TOKEN_EXPIRED");
    }
    throw new AppError(401, "Invalid access token", "INVALID_TOKEN");
  }
}

export function generateRefreshToken() {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
}

export function hashToken(rawToken) {
  if (typeof rawToken !== "string" || rawToken.trim().length === 0) {
    throw new AppError(
      400,
      "Token must be a non-empty string",
      "INVALID_TOKEN_INPUT",
    );
  }
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}
