// @vitest-environment happy-dom

import type {
  AdminOperationsPort,
  AdminSession,
} from "@cc/api-client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminSessionGate } from "../src/components/AdminSessionGate";
import { createAdminSessionStore } from "../src/session";

const session: AdminSession = {
  actor: "editor-1",
  roles: ["EDITOR"],
  active: true,
};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("AdminSessionGate", () => {
  it("exposes the verified port without recreating it", async () => {
    const verifiedPort = {
      session: vi.fn().mockResolvedValue(session),
    } as unknown as AdminOperationsPort;
    const createPort = vi.fn(() => verifiedPort);
    const store = createAdminSessionStore(sessionStorage);

    render(
      <AdminSessionGate createPort={createPort} store={store}>
        {({ port }) => (
          <output>{port === verifiedPort ? "verified-port" : "other-port"}</output>
        )}
      </AdminSessionGate>,
    );

    fireEvent.change(screen.getByLabelText("管理员令牌"), {
      target: { value: "admin-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "进入管理后台" }));

    expect((await screen.findByText("verified-port")).textContent).toBe(
      "verified-port",
    );
    expect(createPort).toHaveBeenCalledTimes(1);
    expect(createPort).toHaveBeenCalledWith(
      "admin-token",
      expect.any(Function),
    );
  });
});
