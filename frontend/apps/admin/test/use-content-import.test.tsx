// @vitest-environment happy-dom

import type {
  AdminOperationsPort,
  ImportBatch,
  RawCandidate,
} from "@cc/api-client";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useContentImport } from "../src/use-content-import";

const runningBatch: ImportBatch = {
  id: "batch-hook",
  ruleVersion: "raw-corpus-v1",
  status: "RUNNING",
  requested: {},
  startedAt: "2026-08-29T00:00:00Z",
  completedAt: null,
};

const completedBatch: ImportBatch = {
  ...runningBatch,
  status: "COMPLETED",
  completedAt: "2026-08-29T00:01:00Z",
};

function candidate(index: number): RawCandidate {
  return {
    importKey: `raw-corpus-v1:character:${index}`,
    source: "XINHUA_WORD",
    sourceRef: `word.json:${index}`,
    sourceHash: `hash-${index}`,
    ruleVersion: "raw-corpus-v1",
    id: `hz-${index}`,
    type: "CHARACTER",
    suggestedLevel: 1,
    suggestedDifficulty: 1,
    promotionRequired: false,
    tags: [],
    payload: { char: "月" },
    score: index,
  };
}

function candidateNdjson(count: number): string {
  return Array.from({ length: count }, (_, index) =>
    JSON.stringify(candidate(index)),
  ).join("\n");
}

function createPort(
  overrides: Partial<AdminOperationsPort> = {},
): AdminOperationsPort {
  return {
    createImport: vi.fn(),
    appendImport: vi.fn(),
    completeImport: vi.fn(),
    ...overrides,
  } as unknown as AdminOperationsPort;
}

describe("useContentImport", () => {
  it("exposes a line-numbered parse error and never creates a batch", async () => {
    const port = createPort();
    const { result } = renderHook(() => useContentImport(port));

    act(() => {
      result.current.commands.selectFile(
        { name: "broken.ndjson", size: 6 },
        '{"id":',
      );
    });

    expect(result.current.state.status).toBe("invalid");
    expect(result.current.state.file).toEqual({
      name: "broken.ndjson",
      size: 6,
    });
    expect(result.current.state.message).toBe(
      "第 1 行不是有效 JSON",
    );

    await act(async () => {
      await result.current.commands.start();
    });
    expect(port.createImport).not.toHaveBeenCalled();
  });

  it("keeps a failed checkpoint and completes from it on retry", async () => {
    const appendImport = vi
      .fn()
      .mockResolvedValueOnce({
        imported: 1000,
        skipped: 0,
        rejected: 0,
      })
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        imported: 1,
        skipped: 0,
        rejected: 0,
      });
    const port = createPort({
      createImport: vi.fn().mockResolvedValue(runningBatch),
      appendImport,
      completeImport: vi.fn().mockResolvedValue(completedBatch),
    });
    const { result } = renderHook(() => useContentImport(port));

    act(() => {
      result.current.commands.selectFile(
        { name: "candidates.ndjson", size: 200_000 },
        candidateNdjson(1001),
      );
    });
    expect(result.current.state.status).toBe("ready");
    expect(result.current.state.candidateCount).toBe(1001);

    await act(async () => {
      await result.current.commands.start();
    });

    expect(result.current.state.status).toBe("failed");
    expect(result.current.state.message).toBe(
      "导入失败：response lost",
    );
    expect(result.current.state.checkpoint).toEqual({
      batchId: "batch-hook",
      nextChunkIndex: 1,
      imported: 1000,
      skipped: 0,
      rejected: 0,
    });
    expect(port.completeImport).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.commands.retry();
    });

    expect(result.current.state.status).toBe("completed");
    expect(result.current.state.batch).toEqual(completedBatch);
    expect(result.current.state.checkpoint).toEqual({
      batchId: "batch-hook",
      nextChunkIndex: 2,
      imported: 1001,
      skipped: 0,
      rejected: 0,
    });
    expect(port.createImport).toHaveBeenCalledTimes(1);
    expect(port.completeImport).toHaveBeenCalledWith("batch-hook");
  });

  it("does not retry when batch creation fails before a checkpoint exists", async () => {
    const createImport = vi.fn().mockRejectedValue("offline");
    const port = createPort({ createImport });
    const { result } = renderHook(() => useContentImport(port));

    act(() => {
      result.current.commands.selectFile(
        { name: "one.ndjson", size: 100 },
        candidateNdjson(1),
      );
    });
    await act(async () => {
      await result.current.commands.start();
    });

    expect(result.current.state.status).toBe("failed");
    expect(result.current.state.message).toBe(
      "导入失败：文件解析失败",
    );
    expect(result.current.state.checkpoint).toBeNull();

    await act(async () => {
      await result.current.commands.retry();
    });
    expect(createImport).toHaveBeenCalledTimes(1);
  });

  it("ignores replacement and duplicate submission while running", async () => {
    let resolveCreate: (batch: ImportBatch) => void = () => {};
    const createImport = vi.fn(
      () =>
        new Promise<ImportBatch>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const port = createPort({
      createImport,
      appendImport: vi.fn().mockResolvedValue({
        imported: 1,
        skipped: 0,
        rejected: 0,
      }),
      completeImport: vi.fn().mockResolvedValue(completedBatch),
    });
    const { result } = renderHook(() => useContentImport(port));

    act(() => {
      result.current.commands.selectFile(
        { name: "original.ndjson", size: 100 },
        candidateNdjson(1),
      );
    });
    const start = result.current.commands.start;
    let firstRun: Promise<void>;
    act(() => {
      firstRun = start();
    });

    act(() => {
      result.current.commands.selectFile(
        { name: "replacement.ndjson", size: 1 },
        "invalid",
      );
    });
    await act(async () => {
      await start();
    });
    expect(result.current.state.file?.name).toBe("original.ndjson");
    expect(createImport).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate(runningBatch);
      await firstRun!;
    });
    expect(result.current.state.status).toBe("completed");
  });
});
