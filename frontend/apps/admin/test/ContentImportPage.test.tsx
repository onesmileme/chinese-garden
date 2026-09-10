// @vitest-environment happy-dom

import type {
  AdminOperationsPort,
  ImportBatch,
  ImportChunkResult,
  RawCandidate,
} from "@cc/api-client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentImportPage } from "../src/pages/ContentImportPage";

const runningBatch: ImportBatch = {
  id: "batch-page",
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
    payload: { char: "敏感原文" },
    score: index,
  };
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ContentImportPage", () => {
  it("shows an error when the selected file cannot be read", async () => {
    const port = createPort();
    render(<ContentImportPage port={port} />);

    fireEvent.change(screen.getByLabelText("NDJSON 文件"), {
      target: {
        files: [
          {
            name: "unreadable.ndjson",
            size: 128,
            text: vi.fn().mockRejectedValue(new Error("read failed")),
          },
        ],
      },
    });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "无法读取文件，请重试",
    );
    expect(port.createImport).not.toHaveBeenCalled();
  });

  it("reads the selected file and shows a line-numbered parse error", async () => {
    const port = createPort();
    const text = vi.fn().mockResolvedValue('{"id":');
    render(<ContentImportPage port={port} />);

    const input = screen.getByLabelText(
      "NDJSON 文件",
    ) as HTMLInputElement;
    expect(input.getAttribute("accept")).toContain(".ndjson");

    fireEvent.change(input, { target: { files: [] } });
    expect(screen.queryByText("文件名")).toBeNull();

    fireEvent.change(input, {
      target: {
        files: [{ name: "broken.ndjson", size: 6, text }],
      },
    });

    expect(
      (await screen.findByRole("alert")).textContent,
    ).toContain("第 1 行不是有效 JSON");
    expect(text).toHaveBeenCalledTimes(1);
    expect(screen.getByText("broken.ndjson")).toBeTruthy();
    expect(screen.getByText("6 B")).toBeTruthy();
    expect(port.createImport).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "开始导入" }).hasAttribute(
        "disabled",
      ),
    ).toBe(true);
  });

  it("disables replacement while uploading and shows final progress without payloads", async () => {
    let resolveAppend: (result: ImportChunkResult) => void = () => {};
    const appendImport = vi.fn(
      () =>
        new Promise<ImportChunkResult>((resolve) => {
          resolveAppend = resolve;
        }),
    );
    const port = createPort({
      createImport: vi.fn().mockResolvedValue(runningBatch),
      appendImport,
      completeImport: vi.fn().mockResolvedValue(completedBatch),
    });
    const source = [candidate(0), candidate(1)]
      .map((value) => JSON.stringify(value))
      .join("\n");
    render(<ContentImportPage port={port} />);

    const input = screen.getByLabelText(
      "NDJSON 文件",
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          {
            name: "candidates.ndjson",
            size: 2048,
            text: vi.fn().mockResolvedValue(source),
          },
        ],
      },
    });
    const start = await screen.findByRole("button", {
      name: "开始导入",
    });
    await screen.findByText("2.0 KB");
    expect(start.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByText("敏感原文")).toBeNull();

    fireEvent.click(start);
    expect((await screen.findByRole("status")).textContent).toContain(
      "正在导入",
    );
    expect(input.hasAttribute("disabled")).toBe(true);
    expect(start.hasAttribute("disabled")).toBe(true);

    resolveAppend({ imported: 1, skipped: 1, rejected: 0 });

    expect(await screen.findByText("导入完成")).toBeTruthy();
    expect(screen.getByText("batch-page")).toBeTruthy();
    expect(screen.getByText("已导入 1")).toBeTruthy();
    expect(screen.getByText("已跳过 1")).toBeTruthy();
    expect(screen.getByText("已拒绝 0")).toBeTruthy();
    const progress = screen.getByLabelText(
      "导入进度",
    ) as HTMLProgressElement;
    expect(progress.max).toBe(2);
    expect(progress.value).toBe(2);
    expect(screen.queryByText("敏感原文")).toBeNull();
  });

  it("offers checkpoint retry without creating another batch", async () => {
    const appendImport = vi
      .fn()
      .mockRejectedValueOnce(new Error("network offline"))
      .mockResolvedValueOnce({
        imported: 1,
        skipped: 0,
        rejected: 0,
      });
    const createImport = vi.fn().mockResolvedValue(runningBatch);
    const port = createPort({
      createImport,
      appendImport,
      completeImport: vi.fn().mockResolvedValue(completedBatch),
    });
    render(<ContentImportPage port={port} />);

    fireEvent.change(screen.getByLabelText("NDJSON 文件"), {
      target: {
        files: [
          {
            name: "retry.ndjson",
            size: 512,
            text: vi
              .fn()
              .mockResolvedValue(JSON.stringify(candidate(0))),
          },
        ],
      },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "开始导入" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "导入失败：network offline",
    );
    expect(screen.getByText("batch-page")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "继续导入" }),
    );

    expect(await screen.findByText("导入完成")).toBeTruthy();
    expect(createImport).toHaveBeenCalledTimes(1);
    expect(appendImport).toHaveBeenCalledTimes(2);
  });
});
