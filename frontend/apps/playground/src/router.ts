import { useSyncExternalStore } from "react";

export type Route =
  | "/home"
  | "/assessment"
  | "/idiom-practice"
  | "/poem-practice"
  | "/challenge"
  | "/lesson"
  | "/summary"
  | "/guardian";

const ROUTES = new Set<Route>([
  "/home",
  "/assessment",
  "/idiom-practice",
  "/poem-practice",
  "/challenge",
  "/lesson",
  "/summary",
  "/guardian",
]);

export function getRoute(): Route {
  const path = globalThis.window.location.hash.slice(1);
  return ROUTES.has(path as Route) ? (path as Route) : "/home";
}

export function navigate(to: Route): void {
  globalThis.window.location.hash = to;
}

export function subscribeRoute(listener: () => void): () => void {
  globalThis.window.addEventListener("hashchange", listener);
  return () => globalThis.window.removeEventListener("hashchange", listener);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribeRoute, getRoute, () => "/home");
}
