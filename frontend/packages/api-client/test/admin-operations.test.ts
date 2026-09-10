import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminOperationsClient } from "../src";

describe("createAdminOperationsClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gets the authenticated admin session", async () => {
    const fetchMock = stubJson({
      actor: "editor-1",
      roles: ["EDITOR"],
      active: true,
    });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await expect(port.session()).resolves.toEqual({
      actor: "editor-1",
      roles: ["EDITOR"],
      active: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/session",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("searches content with defined filters in stable query order", async () => {
    const fetchMock = stubJson({ items: [], nextCursor: null });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.searchContent({
      type: "CHARACTER",
      level: "L1",
      status: "DRAFT",
      tag: "nature",
      keyword: "moon",
      cursor: "hz-yue",
      limit: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/items?type=CHARACTER&level=L1&status=DRAFT&tag=nature&keyword=moon&cursor=hz-yue&limit=20",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("searches content without a query string when filters are empty", async () => {
    const fetchMock = stubJson({ items: [], nextCursor: null });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.searchContent({});

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/items",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("gets content with an encoded id", async () => {
    const fetchMock = stubJson({ id: "hz/月" });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.getContent("hz/月");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/items/hz%2F%E6%9C%88",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates content from the typed draft", async () => {
    const fetchMock = stubJson({ ...contentDraft(), status: "DRAFT", revision: 1 });
    const port = createAdminOperationsClient("/api", () => "admin-token");
    const draft = contentDraft();

    await port.createContent(draft);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(draft),
      }),
    );
  });

  it("updates content with the expected revision", async () => {
    const fetchMock = stubJson({ ...contentDraft(), status: "DRAFT", revision: 4 });
    const port = createAdminOperationsClient("/api", () => "admin-token");
    const draft = contentDraft();

    await port.updateContent("hz/月", 3, draft);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/items/hz%2F%E6%9C%88?expectedRevision=3",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(draft),
      }),
    );
  });

  it("validates content by encoded id", async () => {
    const fetchMock = stubJson({ valid: true, issues: [] });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.validateContent("poem/静夜思");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/items/poem%2F%E9%9D%99%E5%A4%9C%E6%80%9D/validate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
  });

  it("activates content with the expected revision", async () => {
    const fetchMock = stubJson({ ...contentDraft(), status: "ACTIVE", revision: 2 });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.activateContent("hz/月", 1);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/items/hz%2F%E6%9C%88/activate?expectedRevision=1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
  });

  it("archives content with the expected revision", async () => {
    const fetchMock = stubJson({
      ...contentDraft(),
      status: "ARCHIVED",
      revision: 3,
    });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.archiveContent("hz/月", 2);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/items/hz%2F%E6%9C%88/archive?expectedRevision=2",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
  });

  it("gets level coverage", async () => {
    const fetchMock = stubJson([]);
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.coverage();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/levels/coverage",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("forwards unauthorized handling to every admin request", async () => {
    const onUnauthorized = vi.fn();
    stubJson({ code: "ADMIN_UNAUTHORIZED" }, 401);
    const port = createAdminOperationsClient(
      "/api",
      () => "expired-token",
      { onUnauthorized },
    );

    await expect(port.coverage()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("creates an import batch", async () => {
    const fetchMock = stubJson({ id: "batch-1", status: "RUNNING" });
    const port = createAdminOperationsClient("/api", () => "admin-token");
    const request = { ruleVersion: "raw-corpus-v1", characters: 1200 };

    await port.createImport(request);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content-imports",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
  });

  it("appends candidates to an encoded import batch id", async () => {
    const fetchMock = stubJson({ imported: 1, skipped: 0, rejected: 0 });
    const port = createAdminOperationsClient("/api", () => "admin-token");
    const candidates = [rawCandidate()];

    await port.appendImport("batch/1", candidates);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content-imports/batch%2F1/candidates",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(candidates),
      }),
    );
  });

  it("completes an encoded import batch id", async () => {
    const fetchMock = stubJson({ id: "batch/1", status: "COMPLETED" });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.completeImport("batch/1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content-imports/batch%2F1/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
  });

  it("gets an encoded import batch id", async () => {
    const fetchMock = stubJson({ id: "batch/1", status: "RUNNING" });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.getImport("batch/1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content-imports/batch%2F1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("searches releases with defined filters", async () => {
    const fetchMock = stubJson({ items: [], nextCursor: null });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.searchReleases({
      status: "DRAFT",
      cursor: "corpus/v2",
      limit: 20,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/releases?status=DRAFT&cursor=corpus%2Fv2&limit=20",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("searches releases without a query string when filters are empty", async () => {
    const fetchMock = stubJson({ items: [], nextCursor: null });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.searchReleases({});

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/releases",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a release snapshot", async () => {
    const fetchMock = stubJson({ ...releaseRequest(), status: "DRAFT" });
    const port = createAdminOperationsClient("/api", () => "admin-token");
    const request = releaseRequest();

    await port.createRelease(request);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/releases/snapshots",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
  });

  it("gets a release detail by encoded version", async () => {
    const fetchMock = stubJson({ ...releaseRequest(), status: "DRAFT" });
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await port.getRelease("corpus/v3");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/releases/corpus%2Fv3/snapshot",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("registers release artifacts and handles the empty response", async () => {
    const fetchMock = stubNoContent();
    const port = createAdminOperationsClient("/api", () => "admin-token");
    const artifacts = [releaseArtifact()];

    await expect(port.registerArtifacts("corpus/v3", artifacts))
      .resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/releases/corpus%2Fv3/artifacts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ artifacts }),
      }),
    );
  });

  it("transitions a release and handles the empty response", async () => {
    const fetchMock = stubNoContent();
    const port = createAdminOperationsClient("/api", () => "admin-token");

    await expect(port.transitionRelease("corpus/v3", "VALIDATED"))
      .resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/content/releases/corpus%2Fv3/status",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ toStatus: "VALIDATED" }),
      }),
    );
  });
});

function stubJson(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubNoContent() {
  const fetchMock = vi.fn(
    async () => new Response(null, { status: 204 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function contentDraft() {
  return {
    id: "hz-yue",
    type: "CHARACTER" as const,
    level: "L1" as const,
    difficulty: "L1" as const,
    promotionRequired: true,
    tags: ["nature"],
    payload: { char: "月", pinyin: "yue" },
  };
}

function rawCandidate() {
  return {
    importKey: "source:moon",
    source: "source",
    sourceRef: "moon",
    sourceHash: "abc123",
    ruleVersion: "raw-corpus-v1",
    id: "hz-yue",
    type: "CHARACTER" as const,
    suggestedLevel: 1,
    suggestedDifficulty: 1,
    promotionRequired: true,
    tags: ["nature"],
    payload: { char: "月" },
    score: 100,
  };
}

function releaseRequest() {
  return {
    version: "corpus-v3",
    masteryRuleVersion: "mastery-v1",
    progressionRuleVersion: "progression-v1",
    contentLevelRuleVersion: "levels-v1",
    minClientVersion: "1.0.0",
  };
}

function releaseArtifact() {
  return {
    level: 1 as const,
    artifactUrl: "https://cdn.test/corpus-v3-l1.tar.gz",
    sha256: "a".repeat(64),
    fileSize: 1024,
    format: "tar+gzip" as const,
  };
}
