// @vitest-environment happy-dom

import type {
  AdminOperationsPort,
  AdminSession,
} from "@cc/api-client";
import { HttpError } from "@cc/api-client";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, type AdminPortFactory } from "../src/App";

const authenticatedSession: AdminSession = {
  actor: "editor-1",
  roles: ["EDITOR", "REVIEWER"],
  active: true,
};

function portFactory(
  session: () => Promise<AdminSession>,
  overrides: Partial<AdminOperationsPort> = {},
): AdminPortFactory {
  return () =>
    ({
      session,
      searchContent: vi.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
      }),
      coverage: vi.fn().mockResolvedValue([]),
      searchReleases: vi.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
      }),
      ...overrides,
    }) as unknown as AdminOperationsPort;
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.location.hash = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("admin application authentication", () => {
  it("validates a token before storing it and opens the shell", async () => {
    const session = vi.fn().mockResolvedValue(authenticatedSession);
    const createPort = vi.fn(portFactory(session));

    render(<App createPort={createPort} initialRoute="/content" />);

    const input = screen.getByLabelText("管理员令牌");
    expect(input.getAttribute("type")).toBe("password");
    expect(sessionStorage.getItem("cc_admin_token")).toBeNull();

    fireEvent.change(input, { target: { value: "admin-token" } });
    fireEvent.click(screen.getByRole("button", { name: "进入管理后台" }));

    expect((await screen.findByText("editor-1")).textContent).toBe("editor-1");
    expect(createPort).toHaveBeenCalledWith(
      "admin-token",
      expect.any(Function),
    );
    expect(sessionStorage.getItem("cc_admin_token")).toBe("admin-token");
    expect(screen.getByRole("navigation").getAttribute("aria-label")).toBe(
      "管理后台导航",
    );
    expect(screen.getByText("EDITOR").textContent).toBe("EDITOR");
    expect(screen.getByText("REVIEWER").textContent).toBe("REVIEWER");
  });

  it("keeps an invalid token out of storage", async () => {
    const createPort = portFactory(() =>
      Promise.reject(new HttpError(401, "unauthorized")),
    );

    render(<App createPort={createPort} initialRoute="/content" />);

    fireEvent.change(screen.getByLabelText("管理员令牌"), {
      target: { value: "invalid-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "进入管理后台" }));

    expect(
      (await screen.findByRole("alert")).textContent,
    ).toBe("管理员令牌无效");
    expect(sessionStorage.getItem("cc_admin_token")).toBeNull();
    expect(screen.getByLabelText("管理员令牌")).toBeTruthy();
  });

  it("reports a service failure without persisting the token", async () => {
    const createPort = portFactory(() =>
      Promise.reject(new Error("offline")),
    );

    render(<App createPort={createPort} initialRoute="/content" />);

    fireEvent.change(screen.getByLabelText("管理员令牌"), {
      target: { value: "admin-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "进入管理后台" }));

    expect(
      (await screen.findByRole("alert")).textContent,
    ).toBe("无法连接管理服务");
    expect(sessionStorage.getItem("cc_admin_token")).toBeNull();
  });

  it("restores a valid session from session storage", async () => {
    sessionStorage.setItem("cc_admin_token", "restored-token");
    const createPort = vi.fn(
      portFactory(() => Promise.resolve(authenticatedSession)),
    );

    render(<App createPort={createPort} initialRoute="/levels" />);

    expect((await screen.findByText("editor-1")).textContent).toBe("editor-1");
    expect(createPort).toHaveBeenCalledWith(
      "restored-token",
      expect.any(Function),
    );
    expect(screen.getByRole("heading", { name: "等级覆盖" })).toBeTruthy();
  });

  it("reports a non-authentication session restoration failure", async () => {
    sessionStorage.setItem("cc_admin_token", "restored-token");
    const createPort = portFactory(() => Promise.reject(new Error("offline")));

    render(<App createPort={createPort} initialRoute="/content" />);

    expect(
      (await screen.findByRole("alert")).textContent,
    ).toBe("无法恢复管理员会话");
    expect(sessionStorage.getItem("cc_admin_token")).toBeNull();
  });

  it("clears a restored session rejected with 401", async () => {
    sessionStorage.setItem("cc_admin_token", "expired-token");
    const createPort = portFactory(() =>
      Promise.reject(new HttpError(401, "expired")),
    );

    render(<App createPort={createPort} initialRoute="/content" />);

    expect(
      (await screen.findByRole("alert")).textContent,
    ).toBe("会话已失效，请重新登录");
    expect(sessionStorage.getItem("cc_admin_token")).toBeNull();
    expect(screen.getByLabelText("管理员令牌")).toBeTruthy();
  });

  it("ignores a restored session result after unmount", async () => {
    sessionStorage.setItem("cc_admin_token", "restored-token");
    let rejectSession!: (reason: unknown) => void;
    const pending = new Promise<AdminSession>((_resolve, reject) => {
      rejectSession = reject;
    });
    const createPort = portFactory(() => pending);

    const view = render(
      <App createPort={createPort} initialRoute="/content" />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "正在验证管理会话…",
    );

    view.unmount();
    await act(async () => {
      rejectSession(new Error("late failure"));
      await pending.catch(() => undefined);
    });

    expect(sessionStorage.getItem("cc_admin_token")).toBe("restored-token");
  });

  it("shows progress while validating a submitted token", async () => {
    let resolveSession!: (session: AdminSession) => void;
    const pending = new Promise<AdminSession>((resolve) => {
      resolveSession = resolve;
    });
    const createPort = portFactory(() => pending);

    render(<App createPort={createPort} initialRoute="/content" />);
    fireEvent.change(screen.getByLabelText("管理员令牌"), {
      target: { value: "admin-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "进入管理后台" }));

    const pendingButton = screen.getByRole("button", { name: "正在验证…" });
    expect(pendingButton.getAttribute("disabled")).toBe("");

    await act(async () => {
      resolveSession(authenticatedSession);
      await pending;
    });
    expect(screen.getByText("editor-1").textContent).toBe("editor-1");
  });

  it("clears the session when the administrator logs out", async () => {
    sessionStorage.setItem("cc_admin_token", "admin-token");
    const createPort = portFactory(() =>
      Promise.resolve(authenticatedSession),
    );

    render(<App createPort={createPort} initialRoute="/content" />);
    await screen.findByText("editor-1");

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    expect(sessionStorage.getItem("cc_admin_token")).toBeNull();
    expect(screen.getByLabelText("管理员令牌")).toBeTruthy();
  });

  it("uses the production admin port when no factory is injected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(authenticatedSession), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialRoute="/content" />);
    fireEvent.change(screen.getByLabelText("管理员令牌"), {
      target: { value: "production-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "进入管理后台" }));

    expect((await screen.findByText("editor-1")).textContent).toBe("editor-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/admin/session",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Admin-Token": "production-token",
        }),
      }),
    );
  });

  it("logs out and clears storage when any business request returns 401", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/v1/admin/session")
        ? new Response(JSON.stringify(authenticatedSession), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : new Response(
            JSON.stringify({ code: "ADMIN_UNAUTHORIZED" }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialRoute="/content" />);
    fireEvent.change(screen.getByLabelText("管理员令牌"), {
      target: { value: "expired-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "进入管理后台" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("管理员令牌")).toBeTruthy();
    expect(sessionStorage.getItem("cc_admin_token")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/admin/content/items?type=CHARACTER&limit=20",
      expect.anything(),
    );
  });
});

describe("admin application routing and authorization", () => {
  it("mounts all four business pages for an administrator", async () => {
    sessionStorage.setItem("cc_admin_token", "admin-token");
    window.location.hash = "#/content";
    const createPort = portFactory(() =>
      Promise.resolve({
        actor: "admin-1",
        roles: ["ADMIN"],
        active: true,
      }),
    );

    render(<App createPort={createPort} />);
    await screen.findByText("admin-1");

    const routes = [
      ["内容库", "#/content"],
      ["等级覆盖", "#/levels"],
      ["批量导入", "#/imports"],
      ["发布中心", "#/releases"],
    ] as const;

    for (const [name, href] of routes) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(href);

      act(() => {
        window.location.hash = href;
        window.dispatchEvent(new Event("hashchange"));
      });

      expect(screen.getByRole("heading", { name }).textContent).toBe(name);
      expect(screen.queryByText("此页面将在后续任务中实现。")).toBeNull();
    }
  });

  it("hides unauthorized navigation and preserves the shell on a forbidden deep link", async () => {
    sessionStorage.setItem("cc_admin_token", "reviewer-token");
    const createPort = portFactory(() =>
      Promise.resolve({
        actor: "reviewer-1",
        roles: ["REVIEWER"],
        active: true,
      }),
    );

    render(<App createPort={createPort} initialRoute="/imports" />);

    expect(await screen.findByText("reviewer-1")).toBeTruthy();
    expect(screen.getByRole("navigation")).toBeTruthy();
    expect(screen.getByRole("link", { name: "内容库" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "等级覆盖" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "发布中心" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "批量导入" })).toBeNull();
    expect(screen.getByRole("heading", { name: "权限不足" })).toBeTruthy();
    expect(screen.getByText("REVIEWER")).toBeTruthy();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
  });

  it("gives ADMIN access to every navigation entry", async () => {
    sessionStorage.setItem("cc_admin_token", "admin-token");
    const createPort = portFactory(() =>
      Promise.resolve({
        actor: "admin-1",
        roles: ["ADMIN"],
        active: true,
      }),
    );

    render(<App createPort={createPort} initialRoute="/content" />);

    await screen.findByText("admin-1");
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });
});
