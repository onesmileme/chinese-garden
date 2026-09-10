import { useSyncExternalStore } from "react";

export type AdminRoute = "/content" | "/levels" | "/imports" | "/releases";

const ROUTES = new Set<AdminRoute>([
  "/content",
  "/levels",
  "/imports",
  "/releases",
]);

export function getRoute(): AdminRoute {
  const path = globalThis.window.location.hash.slice(1);
  return ROUTES.has(path as AdminRoute) ? (path as AdminRoute) : "/content";
}

export function navigate(to: AdminRoute): void {
  globalThis.window.location.hash = to;
}

export function subscribeRoute(listener: () => void): () => void {
  globalThis.window.addEventListener("hashchange", listener);
  return () => globalThis.window.removeEventListener("hashchange", listener);
}

export function useRoute(): AdminRoute {
  return useSyncExternalStore(subscribeRoute, getRoute, () => "/content");
}
