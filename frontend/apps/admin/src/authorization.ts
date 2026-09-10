import type { AdminRole } from "@cc/api-client";
import type { AdminRoute } from "./router";

export function hasAdminRole(
  roles: readonly AdminRole[],
  requiredRole: AdminRole,
): boolean {
  return roles.includes("ADMIN") || roles.includes(requiredRole);
}

export function canAccessRoute(
  roles: readonly AdminRole[],
  route: AdminRoute,
): boolean {
  if (route === "/levels") return hasAdminRole(roles, "REVIEWER");
  if (route === "/imports") return hasAdminRole(roles, "EDITOR");
  return true;
}
