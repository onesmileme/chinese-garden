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
      const safeBody =
        config.token.length === 0
          ? body
          : body.split(config.token).join("[REDACTED]");
      throw new PoemReviewAdminError(
        `content admin ${method} ${path} failed: HTTP ${response.status} ${safeBody}`,
      );
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error(`content admin ${method} ${path} returned invalid JSON`);
    }
  }

  return {
    async listPoems() {
      const items: AdminPoemItem[] = [];
      const ids = new Set<string>();
      let cursor: string | null = null;
      do {
        const search = new URLSearchParams();
        search.set("type", "POEM");
        search.set("limit", "100");
        if (cursor !== null) search.set("cursor", cursor);
        const page = await request<ContentPage>(
          "GET",
          `/v1/admin/content/items?${search.toString()}`,
        );
        for (const item of page.items) {
          if (ids.has(item.id)) {
            throw new PoemReviewAdminError(
              `content admin returned duplicate poem ID ${item.id}`,
            );
          }
          ids.add(item.id);
          items.push(item);
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
