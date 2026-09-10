import type { AuthSessionContract } from "@cc/content-schema";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession extends AuthTokens, AuthSessionContract {}

export interface AuthSessionStore {
  read(): Promise<AuthSession | null>;
  write(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
}

export interface HttpClient {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  post<T>(
    path: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
  patch<T>(
    path: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
}

export interface HttpAuthOptions {
  tokenHeader?: "Authorization" | "X-Admin-Token";
  onUnauthorized?: () => void;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown = null,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function createHttpClient(
  baseUrl: string,
  getToken: () => string | null,
  options: HttpAuthOptions = {},
): HttpClient {
  const request = async <T>(path: string, init: RequestInit): Promise<T> => {
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string>),
    };
    if (token) {
      const tokenHeader = options.tokenHeader ?? "Authorization";
      headers[tokenHeader] =
        tokenHeader === "Authorization" ? `Bearer ${token}` : token;
    }
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (res.status < 200 || res.status >= 300) {
      if (res.status === 401) {
        options.onUnauthorized?.();
      }
      const contentType = res.headers.get("Content-Type") ?? "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : await res.text();
      throw new HttpError(res.status, `request failed: ${res.status}`, body);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  };
  return {
    get: (path, headers = {}) =>
      request(path, { method: "GET", headers }),
    post: (path, body, headers = {}) =>
      request(path, {
        method: "POST",
        body: JSON.stringify(body),
        headers,
      }),
    patch: (path, body, headers = {}) =>
      request(path, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers,
      }),
  };
}

export function createAuthenticatedHttpClient(
  baseUrl: string,
  store: AuthSessionStore,
  refresh: (refreshToken: string) => Promise<AuthSession>,
): HttpClient {
  return createRefreshingHttpClient(
    (accessToken) => createHttpClient(baseUrl, () => accessToken),
    store,
    refresh,
  );
}

export function createRefreshingHttpClient(
  createClient: (accessToken: string | null) => HttpClient,
  store: AuthSessionStore,
  refresh: (refreshToken: string) => Promise<AuthSession>,
): HttpClient {
  let refreshInFlight: Promise<AuthSession> | null = null;

  const request = async <T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    retried = false,
  ): Promise<T> => {
    const session = await store.read();
    const client = createClient(session?.accessToken ?? null);
    try {
      if (method === "GET") {
        return await client.get<T>(path, headers);
      }
      return method === "POST"
        ? await client.post<T>(path, body, headers)
        : await client.patch<T>(path, body, headers);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401 || !session || retried) {
        throw error;
      }
      refreshInFlight ??= refresh(session.refreshToken)
        .then(async (next) => {
          await store.write(next);
          return next;
        })
        .catch(async (error: unknown) => {
          await store.clear();
          throw error;
        })
        .finally(() => {
          refreshInFlight = null;
        });
      await refreshInFlight;
      return request(method, path, body, headers, true);
    }
  };

  return {
    get: (path, headers) => request("GET", path, undefined, headers),
    post: (path, body, headers) => request("POST", path, body, headers),
    patch: (path, body, headers) => request("PATCH", path, body, headers),
  };
}
