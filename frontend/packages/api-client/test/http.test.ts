import { describe, it, expect, vi } from "vitest";
import {
  createAuthenticatedHttpClient,
  createHttpClient,
  createRefreshingHttpClient,
  type AuthSession,
  type AuthSessionStore,
  type HttpClient,
  HttpError,
} from "../src/http";

describe("createHttpClient", () => {
  it("sends PATCH requests with a JSON body", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ revision: 2 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient("/api", () => null);

    await expect(
      client.patch("/v1/admin/content/items/hz-yue", { tags: ["自然"] }),
    ).resolves.toEqual({ revision: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/items/hz-yue",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ tags: ["自然"] }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("attaches bearer token when present", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient("https://api.test", () => "TOKEN");
    const body = await client.get<{ ok: number }>("/v1/ping");
    expect(body).toEqual({ ok: 1 });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer TOKEN");
    vi.unstubAllGlobals();
  });

  it("attaches a raw admin token when configured", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ active: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createHttpClient("/api", () => "admin-token", {
      tokenHeader: "X-Admin-Token",
    });

    await client.get("/v1/admin/session");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/session",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Admin-Token": "admin-token",
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("notifies unauthorized responses before throwing the normalized error", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    const client = createHttpClient("https://api.test", () => null, {
      onUnauthorized,
    });
    await expect(client.post("/v1/x", {})).rejects.toMatchObject({
      status: 401,
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("does not notify unauthorized handling for other errors", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );
    const client = createHttpClient("https://api.test", () => null, {
      onUnauthorized,
    });

    await expect(client.get("/v1/x")).rejects.toMatchObject({ status: 403 });
    expect(onUnauthorized).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("preserves structured JSON error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: "CONTENT_REVISION_CONFLICT",
              message: "stale revision",
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/json; charset=utf-8" },
            },
          ),
      ),
    );
    const client = createHttpClient("/api", () => null);

    await expect(client.patch("/v1/admin/content/items/hz-yue", {})).rejects
      .toMatchObject({
        status: 409,
        body: {
          code: "CONTENT_REVISION_CONFLICT",
          message: "stale revision",
        },
      });
    vi.unstubAllGlobals();
  });

  it("preserves text error bodies without parsing them as JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("gateway unavailable", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          }),
      ),
    );
    const client = createHttpClient("/api", () => null);

    await expect(client.get("/v1/admin/session")).rejects.toMatchObject({
      status: 503,
      body: "gateway unavailable",
    });
    vi.unstubAllGlobals();
  });

  it("handles an error response without a content type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const client = createHttpClient("/api", () => null);

    await expect(client.get("/v1/admin/session")).rejects.toMatchObject({
      status: 503,
      body: "",
    });
    vi.unstubAllGlobals();
  });

  it("returns undefined for successful 204 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    const client = createHttpClient("/api", () => null);

    await expect(client.post("/v1/admin/content/releases/v1/status", {}))
      .resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("posts JSON without an authorization header when no token exists", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createHttpClient("https://api.test", () => null).post(
      "/v1/items",
      { value: 1 },
      { "X-Request-Id": "request-1" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/v1/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ value: 1 }),
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "request-1",
        },
      }),
    );
    vi.unstubAllGlobals();
  });
});

describe("createAuthenticatedHttpClient", () => {
  it("refreshes concurrent unauthorized requests once", async () => {
    let session: AuthSession | null = {
      accessToken: "expired",
      refreshToken: "refresh-1",
      principalId: "principal-1",
      defaultChildId: "child-1",
    };
    const store: AuthSessionStore = {
      read: vi.fn(async () => session),
      write: vi.fn(async (next) => {
        session = next;
      }),
      clear: vi.fn(async () => {
        session = null;
      }),
    };
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const token = (init.headers as Record<string, string>).Authorization;
      return token === "Bearer expired"
        ? new Response("expired", { status: 401 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const refresh = vi.fn(async () => ({
      accessToken: "fresh",
      refreshToken: "refresh-2",
      principalId: "principal-1",
      defaultChildId: "child-1",
    }));
    const client = createAuthenticatedHttpClient(
      "https://api.test",
      store,
      refresh,
    );

    await Promise.all([client.get("/a"), client.get("/b")]);

    expect(refresh).toHaveBeenCalledOnce();
    expect(store.write).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("clears credentials when refresh fails", async () => {
    const session = authSession();
    const store = authStore(session);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("expired", { status: 401 })),
    );
    const client = createAuthenticatedHttpClient(
      "https://api.test",
      store,
      vi.fn(async () => {
        throw new Error("refresh rejected");
      }),
    );

    await expect(client.get("/a")).rejects.toThrow("refresh rejected");

    expect(store.clear).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});

describe("createRefreshingHttpClient", () => {
  it("retries a Taro-compatible transport only once", async () => {
    let session: AuthSession | null = authSession();
    const store = authStore(session, (next) => {
      session = next;
    });
    const get = vi.fn(async () => {
      throw new HttpError(401, "expired");
    });
    const createClient = vi.fn(() => ({ get, post: vi.fn() }) as HttpClient);
    const client = createRefreshingHttpClient(
      createClient,
      store,
      vi.fn(async () => ({ ...authSession(), accessToken: "fresh" })),
    );

    await expect(client.get("/a")).rejects.toMatchObject({ status: 401 });

    expect(get).toHaveBeenCalledTimes(2);
  });

  it("forwards POST bodies and headers to the current authenticated transport", async () => {
    const post = vi.fn(async () => ({ ok: true }));
    const createClient = vi.fn(() => ({ get: vi.fn(), post }) as HttpClient);
    const client = createRefreshingHttpClient(
      createClient,
      authStore(authSession()),
      vi.fn(),
    );

    await client.post("/items", { value: 1 }, { "X-Child": "child-1" });

    expect(post).toHaveBeenCalledWith(
      "/items",
      { value: 1 },
      { "X-Child": "child-1" },
    );
  });

  it("forwards PATCH bodies and headers to the current authenticated transport", async () => {
    const patch = vi.fn(async () => ({ revision: 2 }));
    const createClient = vi.fn(
      () => ({ get: vi.fn(), post: vi.fn(), patch }) as HttpClient,
    );
    const client = createRefreshingHttpClient(
      createClient,
      authStore(authSession()),
      vi.fn(),
    );

    await client.patch("/items/1", { value: 2 }, { "If-Match": "1" });

    expect(patch).toHaveBeenCalledWith(
      "/items/1",
      { value: 2 },
      { "If-Match": "1" },
    );
  });

  it("does not refresh anonymous unauthorized requests", async () => {
    const refresh = vi.fn();
    const client = createRefreshingHttpClient(
      () =>
        ({
          get: vi.fn(async () => {
            throw new HttpError(401, "unauthorized");
          }),
          post: vi.fn(),
        }) as HttpClient,
      authStore(null),
      refresh,
    );

    await expect(client.get("/a")).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
  });
});

function authSession(): AuthSession {
  return {
    accessToken: "expired",
    refreshToken: "refresh-1",
    principalId: "principal-1",
    defaultChildId: "child-1",
  };
}

function authStore(
  initial: AuthSession | null,
  onWrite: (session: AuthSession) => void = () => undefined,
): AuthSessionStore {
  let session = initial;
  return {
    read: vi.fn(async () => session),
    write: vi.fn(async (next) => {
      session = next;
      onWrite(next);
    }),
    clear: vi.fn(async () => {
      session = null;
    }),
  };
}
