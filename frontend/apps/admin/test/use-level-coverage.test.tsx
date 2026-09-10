// @vitest-environment happy-dom

import type {
  AdminOperationsPort,
  LevelCoverage,
} from "@cc/api-client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLevelCoverage } from "../src/use-level-coverage";

const unorderedCoverage: LevelCoverage[] = [
  {
    level: "L5",
    characters: 50,
    poems: 25,
    chainableIdioms: 40,
    blockingIssues: [],
  },
  {
    level: "L1",
    characters: 10,
    poems: 5,
    chainableIdioms: 8,
    blockingIssues: [],
  },
  {
    level: "L3",
    characters: 30,
    poems: 15,
    chainableIdioms: 24,
    blockingIssues: [],
  },
  {
    level: "L2",
    characters: 20,
    poems: 10,
    chainableIdioms: 16,
    blockingIssues: ["LEVEL_CONTENT_INSUFFICIENT"],
  },
  {
    level: "L4",
    characters: 40,
    poems: 20,
    chainableIdioms: 32,
    blockingIssues: [],
  },
];

function portWith(
  coverage: AdminOperationsPort["coverage"],
): AdminOperationsPort {
  return { coverage } as AdminOperationsPort;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLevelCoverage", () => {
  it("loads coverage and exposes L1-L5 in fixed order", async () => {
    const coverage = vi.fn().mockResolvedValue(unorderedCoverage);
    const port = portWith(coverage);
    const { result } = renderHook(() => useLevelCoverage(port));

    expect(result.current.state.status).toBe("loading");

    await waitFor(() =>
      expect(result.current.state.status).toBe("ready"),
    );

    expect(coverage).toHaveBeenCalledTimes(1);
    expect(result.current.state.rows.map((row) => row.level)).toEqual([
      "L1",
      "L2",
      "L3",
      "L4",
      "L5",
    ]);
  });

  it("fills omitted levels with empty coverage rows", async () => {
    const l3 = unorderedCoverage.find((row) => row.level === "L3");
    const coverage = vi.fn().mockResolvedValue(l3 === undefined ? [] : [l3]);
    const port = portWith(coverage);
    const { result } = renderHook(() => useLevelCoverage(port));

    await waitFor(() =>
      expect(result.current.state.status).toBe("ready"),
    );

    expect(result.current.state.rows).toEqual([
      {
        level: "L1",
        characters: 0,
        poems: 0,
        chainableIdioms: 0,
        blockingIssues: ["LEVEL_CONTENT_INSUFFICIENT"],
      },
      {
        level: "L2",
        characters: 0,
        poems: 0,
        chainableIdioms: 0,
        blockingIssues: ["LEVEL_CONTENT_INSUFFICIENT"],
      },
      l3,
      {
        level: "L4",
        characters: 0,
        poems: 0,
        chainableIdioms: 0,
        blockingIssues: ["LEVEL_CONTENT_INSUFFICIENT"],
      },
      {
        level: "L5",
        characters: 0,
        poems: 0,
        chainableIdioms: 0,
        blockingIssues: ["LEVEL_CONTENT_INSUFFICIENT"],
      },
    ]);
  });

  it("reports request failure and retries the coverage request", async () => {
    const coverage = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(unorderedCoverage);
    const port = portWith(coverage);
    const { result } = renderHook(() => useLevelCoverage(port));

    await waitFor(() =>
      expect(result.current.state.status).toBe("error"),
    );
    expect(result.current.state.message).toBe("无法加载等级覆盖，请重试");
    expect(result.current.state.rows).toEqual([]);

    act(() => {
      result.current.commands.retry();
    });

    expect(result.current.state.status).toBe("loading");
    await waitFor(() =>
      expect(result.current.state.status).toBe("ready"),
    );
    expect(coverage).toHaveBeenCalledTimes(2);
    expect(result.current.state.message).toBeNull();
  });
});
