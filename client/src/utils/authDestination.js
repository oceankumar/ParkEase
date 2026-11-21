export function authDestination(user, from) {
  if (user?.mustChangePassword) return "/dashboard/profile";
  const fallback = user?.role === "GUARD" ? "/dashboard/operations" : "/dashboard";
  const path = from?.pathname;
  if (typeof path !== "string") return fallback;
  const shared = path === "/dashboard/profile" || /^\/malls(?:\/[^/]+(?:\/(?:parking|availability))?)?$/.test(path);
  const driver = user?.role === "USER" && /^\/dashboard\/bookings(?:\/[^/]+(?:\/bill)?)?$/.test(path);
  const management = ["ADMIN", "MALL_OWNER"].includes(user?.role) && /^\/dashboard\/(guards|analytics|reservations|gate-activity)$/.test(path);
  const owner = user?.role === "MALL_OWNER" && /^\/dashboard\/malls\/[^/]+\/(inventory|edit)$/.test(path);
  const guard = user?.role === "GUARD" && /^\/dashboard\/(operations|activity)$/.test(path);
  if (path === "/dashboard") return ["ADMIN", "MALL_OWNER"].includes(user?.role)
    ? `${path}${from.search || ""}${from.hash || ""}` : fallback;
  return shared || driver || management || owner || guard ? `${path}${from.search || ""}${from.hash || ""}` : fallback;
}
