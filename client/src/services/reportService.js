import { sessionRequest } from "./authService.js";

export async function getMallBookings(mallId, params = {}, options = {}) {
  const { data } = await sessionRequest(`/malls/${encodeURIComponent(mallId)}/bookings`, { ...options, params });
  return data;
}
