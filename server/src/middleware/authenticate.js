import User from "../models/User.js";
import { checkAccount } from "../services/authService.js";
import AppError from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";

export default async function authenticate(req, res, next) {
  const token = /^Bearer ([^\s]+)$/i.exec(req.get("Authorization") ?? "")?.[1];
  if (!token) throw new AppError(401, "Access token is required", "TOKEN_MISSING");
  const { sub, sessionVersion = 0 } = verifyAccessToken(token);
  if (!/^[a-f0-9]{24}$/i.test(sub)) {
    throw new AppError(401, "Invalid access token", "INVALID_TOKEN");
  }
  const user = await User.findById(sub);
  if (!user) throw new AppError(401, "Account no longer exists", "INVALID_TOKEN");
  if (sessionVersion !== (user.sessionVersion ?? 0)) {
    throw new AppError(401, "Session ended. Sign in again.", "SESSION_REVOKED");
  }
  checkAccount(user);
  req.user = user;
  next();
}
