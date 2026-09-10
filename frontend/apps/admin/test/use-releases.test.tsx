// @vitest-environment happy-dom

import type {
  AdminOperationsPort,
  ReleaseDetail,
  ReleaseSummary,
} from "@cc/api-client";
import { HttpError } from "@cc/api-client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReleases } from "../src/use-releases";

const draftSummary: ReleaseSummary = {
  version: "corpus-v8",
  masteryRuleVersion: "mastery-v3",
  progressionRuleVersion: "progression-v2",
  contentLevelRuleVersion: "level-v4",
  minClientVersion: "2.8.0",
  status: "DRAFT",
  artifactCount: 0,
  createdAt: "2026-08-29T00:00:00Z",
  publishedAt: null,
};

const draftDetail: ReleaseDetail = {
  version: draftSummary.version,
  masteryRuleVersion: draftSummary.masteryRuleVersion,
  progressionRuleVersion: draftSummary.progressionRuleVersion,
  contentLevelRuleVersion: draftSummary.contentLevelRuleVersion,
  minClientVersion: draftSummary.minClientVersion,
  status: "DRAFT",
  artifacts: [],
  items: [],
};

function createPort(
  overrides: Partial<AdminOperationsPort> = {},
): AdminOperationsPort {
  return {
    searchReleases: vi.fn().mockResolvedValue({
      items: [draftSummary],
      nextCursor: "corpus-v7",
    }),
    getRelease: vi.fn().mockResolvedValue(draftDetail),
    ...overrides,
  } as AdminOperationsPort;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useReleases", () => {
  it("loads releases and appends the next cursor page", async () => {
    const second = { ...draftSummary, version: "corpus-v7" };
    const searchReleases = vi
      .fn()
      .mockResolvedValueOnce({
        items: [draftSummary],
        nextCursor: "corpus-v7",
      })
      .mockResolvedValueOnce({ items: [second], nextCursor: null });
    const port = createPort({ searchReleases });
    const { result } = renderHook(() => useReleases(port));

    expect(result.current.state.listStatus).toBe("loading");
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );
    expect(searchReleases).toHaveBeenCalledWith({ limit: 20 });

    await act(async () => {
      await result.current.commands.loadNext();
    });

    expect(searchReleases).toHaveBeenLastCalledWith({
      cursor: "corpus-v7",
      limit: 20,
    });
    expect(result.current.state.items).toEqual([draftSummary, second]);
    expect(result.current.state.nextCursor).toBeNull();
  });

  it("preserves releases and retries a failed next-page request", async () => {
    const second = { ...draftSummary, version: "corpus-v7" };
    const searchReleases = vi
      .fn()
      .mockResolvedValueOnce({
        items: [draftSummary],
        nextCursor: "corpus-v7",
      })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [second], nextCursor: null });
    const port = createPort({ searchReleases });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    await act(async () => {
      await result.current.commands.loadNext();
    });

    expect(result.current.state.items).toEqual([draftSummary]);
    expect(result.current.state.nextCursor).toBe("corpus-v7");
    expect(result.current.state.loadMoreError).toBe(true);
    expect(result.current.state.message).toBe(
      "无法加载下一页发布记录，请重试",
    );

    await act(async () => {
      await result.current.commands.loadNext();
    });

    expect(result.current.state.items).toEqual([draftSummary, second]);
    expect(result.current.state.loadMoreError).toBe(false);
  });

  it("retries a failed initial release query", async () => {
    const searchReleases = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const port = createPort({ searchReleases });
    const { result } = renderHook(() => useReleases(port));

    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("error"),
    );
    act(() => {
      result.current.commands.retryList();
    });

    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );
    expect(searchReleases).toHaveBeenCalledTimes(2);
  });

  it("reloads the first page when the status filter changes", async () => {
    const searchReleases = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const port = createPort({ searchReleases });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() => expect(searchReleases).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.commands.setStatusFilter("PUBLISHED");
    });

    await waitFor(() =>
      expect(searchReleases).toHaveBeenLastCalledWith({
        status: "PUBLISHED",
        limit: 20,
      }),
    );
    expect(result.current.state.statusFilter).toBe("PUBLISHED");
  });

  it("loads the selected release detail", async () => {
    const getRelease = vi.fn().mockResolvedValue(draftDetail);
    const port = createPort({ getRelease });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    await act(async () => {
      await result.current.commands.selectRelease("corpus-v8");
    });

    expect(getRelease).toHaveBeenCalledWith("corpus-v8");
    expect(result.current.state.selectedVersion).toBe("corpus-v8");
    expect(result.current.state.detailStatus).toBe("ready");
    expect(result.current.state.detail).toEqual(draftDetail);
  });

  it("exposes a failed release detail request", async () => {
    const port = createPort({
      getRelease: vi.fn().mockRejectedValue(new Error("offline")),
    });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    await act(async () => {
      await result.current.commands.selectRelease("corpus-v8");
    });

    expect(result.current.state.detailStatus).toBe("error");
    expect(result.current.state.detail).toBeNull();
  });

  it("creates a snapshot, selects it and refreshes the list", async () => {
    const createRelease = vi.fn().mockResolvedValue(draftDetail);
    const searchReleases = vi.fn().mockResolvedValue({
      items: [draftSummary],
      nextCursor: null,
    });
    const port = createPort({ createRelease, searchReleases });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() => expect(searchReleases).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.commands.updateCreateForm({
        version: " corpus-v8 ",
        masteryRuleVersion: " mastery-v3 ",
        progressionRuleVersion: " progression-v2 ",
        contentLevelRuleVersion: " level-v4 ",
        minClientVersion: " 2.8.0 ",
      });
    });
    await act(async () => {
      await result.current.commands.createRelease();
    });

    expect(createRelease).toHaveBeenCalledWith({
      version: "corpus-v8",
      masteryRuleVersion: "mastery-v3",
      progressionRuleVersion: "progression-v2",
      contentLevelRuleVersion: "level-v4",
      minClientVersion: "2.8.0",
    });
    await waitFor(() => expect(searchReleases).toHaveBeenCalledTimes(2));
    expect(result.current.state.selectedVersion).toBe("corpus-v8");
    expect(result.current.state.detail).toEqual(draftDetail);
    expect(result.current.state.createForm.version).toBe("");
    expect(result.current.state.notice).toBe("发布快照已创建");
  });

  it.each([
    [new HttpError(400, "bad request"), "请求无效，请检查表单"],
    [new HttpError(403, "forbidden"), "没有发布操作权限"],
    [new HttpError(409, "conflict"), "发布状态已变化，请刷新后重试"],
    [new Error("offline"), "操作失败，请重试"],
  ])("keeps the snapshot form after a failed create", async (error, message) => {
    const createRelease = vi.fn().mockRejectedValue(error);
    const port = createPort({ createRelease });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );
    const form = {
      version: "corpus-v9",
      masteryRuleVersion: "mastery-v3",
      progressionRuleVersion: "progression-v2",
      contentLevelRuleVersion: "level-v4",
      minClientVersion: "2.9.0",
    };

    act(() => {
      result.current.commands.updateCreateForm(form);
    });
    await act(async () => {
      await result.current.commands.createRelease();
    });

    expect(result.current.state.createForm).toEqual(form);
    expect(result.current.state.notice).toBe(message);
  });

  it("reports local snapshot validation errors without calling the port", async () => {
    const createRelease = vi.fn();
    const port = createPort({ createRelease });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    await act(async () => {
      await result.current.commands.createRelease();
    });

    expect(createRelease).not.toHaveBeenCalled();
    expect(result.current.state.notice).toBe("请填写所有快照字段");
  });

  it("registers five artifacts and refreshes detail and list", async () => {
    const registeredDetail: ReleaseDetail = {
      ...draftDetail,
      artifacts: [1, 2, 3, 4, 5].map((level) => ({
        releaseVersion: "corpus-v8",
        level: `L${level}` as "L1" | "L2" | "L3" | "L4" | "L5",
        artifactUrl: `https://cdn.test/L${level}.tar.gz`,
        sha256: "a".repeat(64),
        fileSize: level * 100,
        format: "tar+gzip" as const,
        masteryRuleVersion: "mastery-v3",
        progressionRuleVersion: "progression-v2",
        contentLevelRuleVersion: "level-v4",
        minClientVersion: "2.8.0",
      })),
    };
    const getRelease = vi
      .fn()
      .mockResolvedValueOnce(draftDetail)
      .mockResolvedValueOnce(registeredDetail);
    const registerArtifacts = vi.fn().mockResolvedValue(undefined);
    const searchReleases = vi.fn().mockResolvedValue({
      items: [draftSummary],
      nextCursor: null,
    });
    const port = createPort({
      getRelease,
      registerArtifacts,
      searchReleases,
    });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );
    await act(async () => {
      await result.current.commands.selectRelease("corpus-v8");
    });

    act(() => {
      for (const level of [1, 2, 3, 4, 5] as const) {
        result.current.commands.updateArtifactRow(level, {
          artifactUrl: `https://cdn.test/L${level}.tar.gz`,
          sha256: "a".repeat(64),
          fileSize: `${level * 100}`,
        });
      }
    });
    await act(async () => {
      await result.current.commands.registerArtifacts();
    });

    expect(registerArtifacts).toHaveBeenCalledWith(
      "corpus-v8",
      [1, 2, 3, 4, 5].map((level) => ({
        level,
        artifactUrl: `https://cdn.test/L${level}.tar.gz`,
        sha256: "a".repeat(64),
        fileSize: level * 100,
        format: "tar+gzip",
      })),
    );
    expect(getRelease).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(searchReleases).toHaveBeenCalledTimes(2));
    expect(result.current.state.detail).toEqual(registeredDetail);
    expect(result.current.state.notice).toBe("五级制品已登记");
  });

  it("keeps artifact rows when registration fails", async () => {
    const registerArtifacts = vi
      .fn()
      .mockRejectedValue(new HttpError(403, "forbidden"));
    const port = createPort({ registerArtifacts });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );
    await act(async () => {
      await result.current.commands.selectRelease("corpus-v8");
    });
    act(() => {
      for (const level of [1, 2, 3, 4, 5] as const) {
        result.current.commands.updateArtifactRow(level, {
          artifactUrl: `https://cdn.test/L${level}.tar.gz`,
          sha256: "a".repeat(64),
          fileSize: "100",
        });
      }
    });

    await act(async () => {
      await result.current.commands.registerArtifacts();
    });

    expect(result.current.state.artifactRows[0]?.artifactUrl).toBe(
      "https://cdn.test/L1.tar.gz",
    );
    expect(result.current.state.notice).toBe("没有发布操作权限");
  });

  it("transitions only to the next status and refreshes detail and list", async () => {
    const validatedDetail: ReleaseDetail = {
      ...draftDetail,
      status: "VALIDATED",
    };
    const getRelease = vi
      .fn()
      .mockResolvedValueOnce(draftDetail)
      .mockResolvedValueOnce(validatedDetail);
    const transitionRelease = vi.fn().mockResolvedValue(undefined);
    const searchReleases = vi.fn().mockResolvedValue({
      items: [draftSummary],
      nextCursor: null,
    });
    const port = createPort({
      getRelease,
      transitionRelease,
      searchReleases,
    });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );
    await act(async () => {
      await result.current.commands.selectRelease("corpus-v8");
    });

    await act(async () => {
      await result.current.commands.transitionRelease();
    });

    expect(transitionRelease).toHaveBeenCalledWith(
      "corpus-v8",
      "VALIDATED",
    );
    expect(getRelease).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(searchReleases).toHaveBeenCalledTimes(2));
    expect(result.current.state.detail).toEqual(validatedDetail);
    expect(result.current.state.notice).toBe("状态已推进到 VALIDATED");
  });

  it("keeps release detail when a transition fails", async () => {
    const transitionRelease = vi
      .fn()
      .mockRejectedValue(new HttpError(409, "conflict"));
    const port = createPort({ transitionRelease });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );
    await act(async () => {
      await result.current.commands.selectRelease("corpus-v8");
    });
    await act(async () => {
      await result.current.commands.transitionRelease();
    });

    expect(result.current.state.detail).toEqual(draftDetail);
    expect(result.current.state.notice).toBe(
      "发布状态已变化，请刷新后重试",
    );
  });

  it("ignores commands that have no cursor, selection or next status", async () => {
    const retiredDetail = {
      ...draftDetail,
      status: "RETIRED" as const,
    };
    const searchReleases = vi.fn().mockResolvedValue({
      items: [draftSummary],
      nextCursor: null,
    });
    const registerArtifacts = vi.fn();
    const transitionRelease = vi.fn();
    const port = createPort({
      getRelease: vi.fn().mockResolvedValue(retiredDetail),
      registerArtifacts,
      searchReleases,
      transitionRelease,
    });
    const { result } = renderHook(() => useReleases(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    await act(async () => {
      await result.current.commands.loadNext();
      await result.current.commands.registerArtifacts();
      await result.current.commands.transitionRelease();
    });
    expect(searchReleases).toHaveBeenCalledTimes(1);
    expect(registerArtifacts).not.toHaveBeenCalled();
    expect(transitionRelease).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.commands.selectRelease("corpus-v8");
    });
    await act(async () => {
      await result.current.commands.transitionRelease();
    });
    expect(transitionRelease).not.toHaveBeenCalled();
  });
});
