import type {
  AdminOperationsPort,
  ImportBatch,
  RawCandidate,
} from "@cc/api-client";
import { describe, expect, it, vi } from "vitest";
import {
  runCandidateImport,
  type ImportCheckpoint,
} from "../src/import/import-runner";

const runningBatch: ImportBatch = {
  id: "batch-1",
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

describe("runCandidateImport", () => {
  it("uploads 2001 candidates sequentially in ordered chunks before completion", async () => {
    const calls: string[] = [];
    const createImport = vi.fn(async () => {
      calls.push("create");
      return runningBatch;
    });
    const appendImport = vi.fn(
      async (_batchId: string, candidates: RawCandidate[]) => {
        calls.push(`append:${candidates[0]!.importKey}`);
        return {
          imported: candidates.length,
          skipped: 0,
          rejected: 0,
        };
      },
    );
    const completeImport = vi.fn(async () => {
      calls.push("complete");
      return completedBatch;
    });
    const port = {
      createImport,
      appendImport,
      completeImport,
    } as unknown as AdminOperationsPort;
    const candidates = Array.from({ length: 2001 }, (_, index) =>
      candidate(index),
    );
    const progress: ImportCheckpoint[] = [];

    await expect(
      runCandidateImport(
        port,
        { candidates, ruleVersion: "raw-corpus-v1" },
        null,
        (checkpoint) => progress.push(checkpoint),
      ),
    ).resolves.toEqual(completedBatch);

    expect(createImport).toHaveBeenCalledWith({
      ruleVersion: "raw-corpus-v1",
      candidateCount: 2001,
    });
    expect(
      appendImport.mock.calls.map(([, chunk]) => chunk.length),
    ).toEqual([1000, 1000, 1]);
    expect(
      appendImport.mock.calls.flatMap(([, chunk]) =>
        chunk.map(({ importKey }) => importKey),
      ),
    ).toEqual(candidates.map(({ importKey }) => importKey));
    expect(progress).toEqual([
      {
        batchId: "batch-1",
        nextChunkIndex: 0,
        imported: 0,
        skipped: 0,
        rejected: 0,
      },
      {
        batchId: "batch-1",
        nextChunkIndex: 1,
        imported: 1000,
        skipped: 0,
        rejected: 0,
      },
      {
        batchId: "batch-1",
        nextChunkIndex: 2,
        imported: 2000,
        skipped: 0,
        rejected: 0,
      },
      {
        batchId: "batch-1",
        nextChunkIndex: 3,
        imported: 2001,
        skipped: 0,
        rejected: 0,
      },
    ]);
    expect(calls).toEqual([
      "create",
      "append:raw-corpus-v1:character:0",
      "append:raw-corpus-v1:character:1000",
      "append:raw-corpus-v1:character:2000",
      "complete",
    ]);
  });

  it("retains the checkpoint and resends an uncertain chunk by importKey", async () => {
    const candidates = Array.from({ length: 2001 }, (_, index) =>
      candidate(index),
    );
    let uncertainChunk: string[] = [];
    const appendImport = vi
      .fn()
      .mockResolvedValueOnce({
        imported: 1000,
        skipped: 0,
        rejected: 0,
      })
      .mockImplementationOnce(
        async (_batchId: string, chunk: RawCandidate[]) => {
          uncertainChunk = chunk.map(({ importKey }) => importKey);
          throw new Error("response lost");
        },
      )
      .mockResolvedValueOnce({
        imported: 0,
        skipped: 1000,
        rejected: 0,
      })
      .mockResolvedValueOnce({
        imported: 1,
        skipped: 0,
        rejected: 0,
      });
    const createImport = vi.fn().mockResolvedValue(runningBatch);
    const completeImport = vi.fn().mockResolvedValue(completedBatch);
    const port = {
      createImport,
      appendImport,
      completeImport,
    } as unknown as AdminOperationsPort;
    let checkpoint: ImportCheckpoint | null = null;
    const saveCheckpoint = (next: ImportCheckpoint) => {
      checkpoint = next;
    };
    const parsed = {
      candidates,
      ruleVersion: "raw-corpus-v1",
    };

    await expect(
      runCandidateImport(port, parsed, null, saveCheckpoint),
    ).rejects.toThrow("response lost");

    expect(checkpoint).toEqual({
      batchId: "batch-1",
      nextChunkIndex: 1,
      imported: 1000,
      skipped: 0,
      rejected: 0,
    });
    expect(completeImport).not.toHaveBeenCalled();

    await expect(
      runCandidateImport(port, parsed, checkpoint, saveCheckpoint),
    ).resolves.toEqual(completedBatch);

    const retriedChunk = appendImport.mock.calls[2]![1] as RawCandidate[];
    expect(retriedChunk.map(({ importKey }) => importKey)).toEqual(
      uncertainChunk,
    );
    expect(createImport).toHaveBeenCalledTimes(1);
    expect(completeImport).toHaveBeenCalledTimes(1);
    expect(checkpoint).toEqual({
      batchId: "batch-1",
      nextChunkIndex: 3,
      imported: 1001,
      skipped: 1000,
      rejected: 0,
    });
  });
});
