// @vitest-environment happy-dom

import type {
  AdminOperationsPort,
  LevelCoverage,
} from "@cc/api-client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LevelCoveragePage } from "../src/pages/LevelCoveragePage";

const coverageRows: LevelCoverage[] = [
  {
    level: "L3",
    characters: 30,
    poems: 15,
    chainableIdioms: 24,
    blockingIssues: [],
  },
  {
    level: "L1",
    characters: 0,
    poems: 0,
    chainableIdioms: 0,
    blockingIssues: [],
  },
  {
    level: "L5",
    characters: 50,
    poems: 25,
    chainableIdioms: 40,
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
  cleanup();
  vi.restoreAllMocks();
});

describe("LevelCoveragePage", () => {
  it("renders the L1-L5 matrix with text and icons for release status", async () => {
    const coverage = vi.fn().mockResolvedValue(coverageRows);

    render(<LevelCoveragePage port={portWith(coverage)} />);

    expect(screen.getByRole("status").textContent).toBe(
      "正在加载等级覆盖…",
    );
    await screen.findByRole("table", { name: "L1-L5 等级覆盖" });

    const rows = screen
      .getAllByRole("row")
      .slice(1) as HTMLTableRowElement[];
    expect(rows.map((row) => row.cells[0]?.textContent)).toEqual([
      "L1",
      "L2",
      "L3",
      "L4",
      "L5",
    ]);
    expect(rows[0]?.textContent).toContain("L1000");
    expect(rows[1]?.textContent).toContain("L2201016");

    const ready = screen.getByRole("status", { name: "L1 可发布" });
    expect(ready.textContent).toContain("可发布");
    expect(ready.querySelector("svg")).not.toBeNull();

    const blocked = screen.getByRole("status", {
      name: "L2 发布阻塞",
    });
    expect(blocked.textContent).toContain("发布阻塞");
    expect(blocked.querySelector("svg")).not.toBeNull();

    const issueToggle = screen.getByText("查看 1 个阻塞项");
    fireEvent.click(issueToggle);
    expect(issueToggle.parentElement?.hasAttribute("open")).toBe(true);
    expect(screen.getByText("LEVEL_CONTENT_INSUFFICIENT")).toBeTruthy();
  });

  it("shows a retryable error and restores the matrix", async () => {
    const coverage = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(coverageRows);

    render(<LevelCoveragePage port={portWith(coverage)} />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "无法加载等级覆盖，请重试",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "重试加载等级覆盖" }),
    );

    expect(screen.getByRole("status").textContent).toBe(
      "正在加载等级覆盖…",
    );
    await waitFor(() =>
      expect(coverage).toHaveBeenCalledTimes(2),
    );
    expect(
      await screen.findByRole("table", { name: "L1-L5 等级覆盖" }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("marks omitted levels as insufficient instead of publishable", async () => {
    const coverage = vi.fn().mockResolvedValue([coverageRows[0]]);

    render(<LevelCoveragePage port={portWith(coverage)} />);

    await screen.findByRole("table", { name: "L1-L5 等级覆盖" });
    expect(
      screen.getByRole("status", { name: "L1 发布阻塞" }),
    ).toBeTruthy();
    expect(screen.queryByRole("status", { name: "L1 可发布" })).toBeNull();
    expect(
      screen.getAllByText("LEVEL_CONTENT_INSUFFICIENT"),
    ).toHaveLength(4);
  });
});
