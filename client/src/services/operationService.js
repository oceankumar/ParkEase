import { sessionRequest } from "./authService.js";

export async function verifyPass(mallId, token, action) {
  const { data } = await sessionRequest("/qr/verify", { method: "POST", body: { mallId, token, action } });
  return data;
}

export async function recordGateOperation(action, request) {
  if (!["ENTRY", "EXIT"].includes(action)) throw new Error("Choose entry or exit.");
  const { data } = await sessionRequest(`/operations/${action.toLowerCase()}`, { method: "POST", body: request });
  return data;
}

export async function recentOperations(params, options = {}) {
  const { data } = await sessionRequest("/operations/recent", { ...options, params });
  return data;
}

export const passReasons = {
  INVALID_TOKEN: "This credential was not found. Ask the driver to generate a new pass.",
  WRONG_MALL: "This pass belongs to another mall.",
  WRONG_PURPOSE: "This pass is for the other gate action. Ask for the correct entry or exit pass.",
  TOKEN_USED: "This pass was used or replaced. Ask the driver for their latest pass.",
  TOKEN_EXPIRED: "This pass has expired. Ask the driver to generate a new one.",
  TOO_EARLY: "The scheduled arrival time has not started yet.",
  ENTRY_DEADLINE_PASSED: "The entry deadline has passed. This reservation cannot admit the vehicle.",
  WRONG_BOOKING_STATE: "The reservation is no longer eligible for this action.",
  ACTIVE_VISIT_CONFLICT: "The driver or bay already has an active visit.",
};
