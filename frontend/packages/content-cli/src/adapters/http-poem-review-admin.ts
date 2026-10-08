import {
  PoemReviewAdminError,
  type PoemReviewAdminPort,
} from "../poem-review-admin";
import type {
  AdminPoemItem,
  ValidationResponse,
} from "../poem-review";

export interface HttpPoemReviewAdminConfig {
  baseUrl: string;
  token: string;
}

interface ContentPage {
  items: AdminPoemItem[];
  nextCursor: string | null;
}

function isContentPage(value: unknown): value is ContentPage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const page = value as Record<string, unknown>;
  return (
    Array.isArray(page.items) &&
    "nextCursor" in page &&
    (typeof page.nextCursor === "string" || page.nextCursor === null)
  );
}

export function redactPoemReviewDiagnostic(
  value: string,
  token: string,
): string {
  if (token.length === 0) return value;
  const search = new URLSearchParams();
  search.set("token", token);
  const formEncodedToken = search.toString().slice("token=".length);
  const jsonEscapedToken = JSON.stringify(token).slice(1, -1);
  const variants = [
    ...new Set([
      token,
      encodeURIComponent(token),
      formEncodedToken,
      jsonEscapedToken,
    ]),
  ].sort((left, right) => right.length - left.length);
  return variants.reduce(
    (safeValue, variant) => safeValue.split(variant).join("[REDACTED]"),
    value,
  );
}

export function createHttpPoemReviewAdmin(
  config: HttpPoemReviewAdminConfig,
): PoemReviewAdminPort {
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  async function request<T>(
    method: "GET" | "POST",
    path: string,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": config.token,
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    const body = await response.text();
    if (!response.ok) {
      const safePath = redactPoemReviewDiagnostic(path, config.token);
      const safeBody = redactPoemReviewDiagnostic(body, config.token);
      throw new PoemReviewAdminError(
        `content admin ${method} ${safePath} failed: HTTP ${response.status} ${safeBody}`,
      );
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      const safePath = redactPoemReviewDiagnostic(path, config.token);
      throw new Error(
        `content admin ${method} ${safePath} returned invalid JSON`,
      );
    }
  }

  return {
    async listPoems() {
      const items: AdminPoemItem[] = [];
      const ids = new Set<string>();
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const search = new URLSearchParams();
        search.set("type", "POEM");
        search.set("limit", "100");
        if (cursor !== null) search.set("cursor", cursor);
        const page = await request<unknown>(
          "GET",
          `/v1/admin/content/items?${search.toString()}`,
        );
        if (!isContentPage(page)) {
          throw new PoemReviewAdminError(
            "content admin returned invalid content page",
          );
        }
        for (const item of page.items) {
          if (ids.has(item.id)) {
            const safeId = redactPoemReviewDiagnostic(item.id, config.token);
            throw new PoemReviewAdminError(
              `content admin returned duplicate poem ID ${safeId}`,
            );
          }
          ids.add(item.id);
          items.push(item);
        }
        if (page.nextCursor !== null) {
          if (cursors.has(page.nextCursor)) {
            throw new PoemReviewAdminError(
              "content admin returned repeated content cursor",
            );
          }
          cursors.add(page.nextCursor);
        }
        cursor = page.nextCursor;
      } while (cursor !== null);
      return items;
    },
    validate(id) {
      return request<ValidationResponse>(
        "POST",
        `/v1/admin/content/items/${encodeURIComponent(id)}/validate`,
      );
    },
    activate(id, expectedRevision) {
      const search = new URLSearchParams();
      search.set("expectedRevision", String(expectedRevision));
      return request<AdminPoemItem>(
        "POST",
        `/v1/admin/content/items/${encodeURIComponent(id)}/activate?${search.toString()}`,
      );
    },
    archive(id, expectedRevision) {
      const search = new URLSearchParams();
      search.set("expectedRevision", String(expectedRevision));
      return request<AdminPoemItem>(
        "POST",
        `/v1/admin/content/items/${encodeURIComponent(id)}/archive?${search.toString()}`,
      );
    },
  };
}
