import { Router } from "express";
import mongoose from "mongoose";
import authenticate from "../middleware/authenticate.js";
import { requireActiveAccount } from "../middleware/authorize.js";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import AppError from "../utils/AppError.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { validatePassword } from "../utils/validators.js";
import { accountRateLimit } from "../middleware/accountRateLimit.js";

const router = Router();
router.use(authenticate, requireActiveAccount, (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.get("/profile", (req, res) => res.json({ success: true, data: { user: req.user } }));
router.patch("/profile", async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["name", "phone"].includes(key)) || !Object.keys(body).length)
    throw new AppError(400, "Only name and phone may be updated", "INVALID_PROFILE");
  const changes = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.length > 100)
      throw new AppError(400, "Invalid name", "INVALID_PROFILE");
    changes.name = body.name.trim();
  }
  if (body.phone !== undefined) {
    if (body.phone !== null && (typeof body.phone !== "string" || body.phone.length > 20))
      throw new AppError(400, "Invalid phone", "INVALID_PROFILE");
    changes.phone = body.phone?.trim() ?? null;
  }
  const user = await User.findByIdAndUpdate(req.user._id, { $set: changes }, { new: true, runValidators: true });
  res.json({ success: true, data: { user } });
});
router.patch("/password", accountRateLimit(5), async (req, res) => {
  const body = req.body;
  if (!body || Array.isArray(body) || typeof body !== "object" ||
      Object.keys(body).some((key) => !["currentPassword", "newPassword"].includes(key)))
    throw new AppError(400, "Invalid password fields", "INVALID_BODY");
  const newPassword = validatePassword(body.newPassword);
  const passwordHash = await hashPassword(newPassword);
  await mongoose.connection.transaction(async (session) => {
    const user = await User.findById(req.user._id).select("+passwordHash").session(session);
    if (!user || !await verifyPassword(body.currentPassword, user.passwordHash))
      throw new AppError(403, "Current password is incorrect", "INVALID_PASSWORD");
    if (await verifyPassword(newPassword, user.passwordHash))
      throw new AppError(400, "Choose a different password", "INVALID_PASSWORD");
    user.passwordHash = passwordHash;
    user.mustChangePassword = false;
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    user.gateRevision = (user.gateRevision ?? 0) + 1;
    await user.save({ session });
    await RefreshToken.updateMany({ userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }, { session });
  });
  res.json({ success: true, message: "Password changed. Sign in again." });
});
export default router;
