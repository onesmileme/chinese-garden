import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../src/auth";
import type { HttpClient } from "../src/http";

describe("createAuthClient", () => {
  it("parses platform login responses", async () => {
    const post = vi.fn(async () => ({
      accessToken: "access",
      refreshToken: "refresh",
      principalId: "principal-1",
      defaultChildId: "child-1",
    }));
    const http = { get: vi.fn(), post } as HttpClient;

    const session = await createAuthClient(http).platformLogin({
      platform: "WECHAT",
      platformAppId: "wx-app",
      code: "code-1",
    });

    expect(session.defaultChildId).toBe("child-1");
    expect(post).toHaveBeenCalledWith("/v1/auth/platform-login", {
      platform: "WECHAT",
      platformAppId: "wx-app",
      code: "code-1",
    });
  });

  it("rejects malformed auth responses", async () => {
    const http = {
      get: vi.fn(),
      post: vi.fn(async () => ({ accessToken: "" })),
    } as HttpClient;

    await expect(
      createAuthClient(http).refresh("refresh-1"),
    ).rejects.toThrow();
  });
});
