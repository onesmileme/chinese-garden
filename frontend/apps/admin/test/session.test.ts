// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { createAdminSessionStore } from "../src/session";

afterEach(() => {
  sessionStorage.clear();
});

describe("admin session store", () => {
  it("persists and clears only the admin session token", () => {
    const store = createAdminSessionStore(sessionStorage);

    expect(store.read()).toBeNull();

    store.write("admin-token");

    expect(store.read()).toBe("admin-token");
    expect(sessionStorage.getItem("cc_admin_token")).toBe("admin-token");
    expect(localStorage.getItem("cc_admin_token")).toBeNull();

    store.clear();

    expect(store.read()).toBeNull();
  });
});
