// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRoute,
  navigate,
  subscribeRoute,
} from "../src/router";

afterEach(() => {
  window.location.hash = "";
});

describe("admin hash router", () => {
  it("parses supported routes and falls back to content", () => {
    window.location.hash = "#/levels";
    expect(getRoute()).toBe("/levels");

    window.location.hash = "#/not-a-route";
    expect(getRoute()).toBe("/content");

    window.location.hash = "";
    expect(getRoute()).toBe("/content");
  });

  it("navigates and publishes hash changes to subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRoute(listener);

    navigate("/imports");
    window.dispatchEvent(new Event("hashchange"));

    expect(window.location.hash).toBe("#/imports");
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    window.dispatchEvent(new Event("hashchange"));
    expect(listener).not.toHaveBeenCalled();
  });
});
