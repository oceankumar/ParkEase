import "../config/env.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import ROLES from "../constants/roles.js";
import { USER_STATUS } from "../constants/statuses.js";
import User from "../models/User.js";
import { hashPassword } from "../utils/password.js";
import { validateEmail, validatePassword } from "../utils/validators.js";

// Concurrent bootstrap runs share one ID, even with different email settings.
const bootstrapId = "000000000000000000000001";

function readConfig() {
  const invalid = [];
  const { MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  const name = process.env.ADMIN_NAME?.trim() || "ParkEase Admin";
  if (!/^mongodb(\+srv)?:\/\/\S+$/.test(MONGODB_URI ?? "")) invalid.push("MONGODB_URI");
  if (name.length < 2 || name.length > 100) invalid.push("ADMIN_NAME");
  let email;
  try {
    email = validateEmail(ADMIN_EMAIL);
  } catch {
    invalid.push("ADMIN_EMAIL");
  }
  try {
    validatePassword(ADMIN_PASSWORD);
    if (ADMIN_PASSWORD === "replace-with-a-strong-password") invalid.push("ADMIN_PASSWORD");
  } catch {
    invalid.push("ADMIN_PASSWORD");
  }
  if (invalid.length) {
    throw new Error(`Missing or invalid configuration: ${invalid.join(", ")}.`);
  }
  return { name, email, password: ADMIN_PASSWORD };
}

async function alreadySeeded(email) {
  const owner = await User.findOne({ email }).select("role");
  if (owner && owner.role !== ROLES.ADMIN) {
    console.error("Cannot seed Admin: ADMIN_EMAIL is already registered to a non-admin account.");
    process.exitCode = 1;
    return true;
  }

  if (owner || await User.exists({ role: ROLES.ADMIN, status: USER_STATUS.ACTIVE })) {
    console.log("Admin account already exists. Skipping seed.");
    return true;
  }
  return false;
}

async function main() {
  let config;
  try {
    config = readConfig();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  try {
    const passwordHash = await hashPassword(config.password);
    await connectDB();
    if (await alreadySeeded(config.email)) return;
    try {
      await User.create({
        _id: bootstrapId,
        email: config.email,
        name: config.name,
        passwordHash,
        role: ROLES.ADMIN,
        status: USER_STATUS.ACTIVE,
      });
      console.log("Admin account created.");
    } catch (err) {
      if (err.code !== 11000 || !(await alreadySeeded(config.email))) throw err;
    }
  } catch {
    console.error("Admin seed failed. Check MongoDB availability and seed configuration.");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

await main();
