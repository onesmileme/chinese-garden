// @vitest-environment happy-dom

import type {
  AdminOperationsPort,
  ReleaseDetail,
  ReleaseSummary,
} from "@cc/api-client";
import { HttpError } from "@cc/api-client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReleaseCenterPage } from "../src/pages/ReleaseCenterPage";

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

function portWith(
  overrides: Partial<AdminOperationsPort> = {},
): AdminOperationsPort {
  return {
    searchReleases: vi.fn().mockResolvedValue({
      items: [draftSummary],
      nextCursor: null,
    }),
    getRelease: vi.fn().mockResolvedValue(draftDetail),
    ...overrides,
  } as AdminOperationsPort;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ReleaseCenterPage", () => {
  it("filters and paginates releases, then opens a detail", async () => {
    const second = { ...draftSummary, version: "corpus-v7" };
    const searchReleases = vi.fn(async (query: {
      status?: string;
      cursor?: string;
    }) => {
      if (query.cursor !== undefined) {
        return { items: [second], nextCursor: null };
      }
      return { items: [draftSummary], nextCursor: "corpus-v7" };
    });
    const getRelease = vi.fn().mockResolvedValue(draftDetail);
    render(
      <ReleaseCenterPage
        port={portWith({ searchReleases, getRelease })}
        roles={["PUBLISHER"]}
      />,
    );

    expect(screen.getByRole("status").textContent).toBe("正在加载发布记录…");
    expect((await screen.findByText("corpus-v8")).textContent).toBe(
      "corpus-v8",
    );

    fireEvent.change(screen.getByLabelText("发布状态"), {
      target: { value: "DRAFT" },
    });
    await waitFor(() =>
      expect(searchReleases).toHaveBeenLastCalledWith({
        status: "DRAFT",
        limit: 20,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("corpus-v7")).toBeTruthy();
    expect(searchReleases).toHaveBeenLastCalledWith({
      status: "DRAFT",
      cursor: "corpus-v7",
      limit: 20,
    });

    fireEvent.click(screen.getByRole("button", { name: "查看 corpus-v8" }));
    expect(
      await screen.findByRole("heading", { name: "corpus-v8 详情" }),
    ).toBeTruthy();
    expect(getRelease).toHaveBeenCalledWith("corpus-v8");
    expect(screen.getByText("快照内容：0 项")).toBeTruthy();
  });

  it("retries failed release list and next-page requests", async () => {
    const second = { ...draftSummary, version: "corpus-v7" };
    const searchReleases = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        items: [draftSummary],
        nextCursor: "corpus-v7",
      })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [second], nextCursor: null });
    render(
      <ReleaseCenterPage
        port={portWith({ searchReleases })}
        roles={["PUBLISHER"]}
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "无法加载发布记录，请重试",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "重试加载发布记录" }),
    );
    await screen.findByText("corpus-v8");

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "无法加载下一页发布记录，请重试",
    );
    expect(screen.getByText("corpus-v8")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "重试加载下一页发布记录",
      }),
    );

    expect(await screen.findByText("corpus-v7")).toBeTruthy();
  });

  it("shows an empty list and a release detail error", async () => {
    const searchReleases = vi
      .fn()
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({
        items: [draftSummary],
        nextCursor: null,
      });
    const getRelease = vi.fn().mockRejectedValue(new Error("offline"));
    const view = render(
      <ReleaseCenterPage
        port={portWith({ getRelease, searchReleases })}
        roles={["PUBLISHER"]}
      />,
    );

    expect(
      await screen.findByText("没有符合条件的发布记录"),
    ).toBeTruthy();

    view.unmount();
    render(
      <ReleaseCenterPage
        port={portWith({ getRelease, searchReleases })}
        roles={["PUBLISHER"]}
      />,
    );
    await screen.findByText("corpus-v8");
    fireEvent.click(screen.getByRole("button", { name: "查看 corpus-v8" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "无法加载发布详情，请重试",
    );
  });

  it("creates a release snapshot from the visible form", async () => {
    const createRelease = vi.fn().mockResolvedValue(draftDetail);
    render(
      <ReleaseCenterPage
        port={portWith({ createRelease })}
        roles={["PUBLISHER"]}
      />,
    );
    await screen.findByText("corpus-v8");

    const values = [
      ["发布版本", "corpus-v9"],
      ["掌握规则版本", "mastery-v3"],
      ["晋级规则版本", "progression-v2"],
      ["内容等级规则版本", "level-v4"],
      ["最低客户端版本", "2.9.0"],
    ] as const;
    for (const [label, value] of values) {
      fireEvent.change(screen.getByLabelText(label), {
        target: { value },
      });
    }
    fireEvent.click(
      screen.getByRole("button", { name: "创建发布快照" }),
    );

    await waitFor(() =>
      expect(createRelease).toHaveBeenCalledWith({
        version: "corpus-v9",
        masteryRuleVersion: "mastery-v3",
        progressionRuleVersion: "progression-v2",
        contentLevelRuleVersion: "level-v4",
        minClientVersion: "2.9.0",
      }),
    );
    expect(await screen.findByText("发布快照已创建")).toBeTruthy();
  });

  it("registers exactly five HTTPS artifacts from a draft detail", async () => {
    const getRelease = vi.fn().mockResolvedValue(draftDetail);
    const registerArtifacts = vi.fn().mockResolvedValue(undefined);
    render(
      <ReleaseCenterPage
        port={portWith({ getRelease, registerArtifacts })}
        roles={["PUBLISHER"]}
      />,
    );
    await screen.findByText("corpus-v8");
    fireEvent.click(screen.getByRole("button", { name: "查看 corpus-v8" }));
    await screen.findByRole("heading", { name: "corpus-v8 详情" });

    for (const level of [1, 2, 3, 4, 5]) {
      fireEvent.change(screen.getByLabelText(`L${level} HTTPS URL`), {
        target: { value: `https://cdn.test/L${level}.tar.gz` },
      });
      fireEvent.change(screen.getByLabelText(`L${level} SHA-256`), {
        target: { value: "a".repeat(64) },
      });
      fireEvent.change(screen.getByLabelText(`L${level} 文件大小`), {
        target: { value: `${level * 100}` },
      });
    }
    fireEvent.click(
      screen.getByRole("button", { name: "登记五级制品" }),
    );

    await waitFor(() =>
      expect(registerArtifacts).toHaveBeenCalledWith(
        "corpus-v8",
        [1, 2, 3, 4, 5].map((level) => ({
          level,
          artifactUrl: `https://cdn.test/L${level}.tar.gz`,
          sha256: "a".repeat(64),
          fileSize: level * 100,
          format: "tar+gzip",
        })),
      ),
    );
    expect(await screen.findByText("五级制品已登记")).toBeTruthy();
  });

  it("confirms a release transition with its version and next status", async () => {
    const validatedDetail = { ...draftDetail, status: "VALIDATED" as const };
    const getRelease = vi
      .fn()
      .mockResolvedValueOnce(draftDetail)
      .mockResolvedValueOnce(validatedDetail);
    const transitionRelease = vi.fn().mockResolvedValue(undefined);
    const confirm = vi
      .spyOn(globalThis, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(
      <ReleaseCenterPage
        port={portWith({ getRelease, transitionRelease })}
        roles={["PUBLISHER"]}
      />,
    );
    await screen.findByText("corpus-v8");
    fireEvent.click(screen.getByRole("button", { name: "查看 corpus-v8" }));
    await screen.findByRole("heading", { name: "corpus-v8 详情" });

    fireEvent.click(
      screen.getByRole("button", { name: "推进到 VALIDATED" }),
    );
    expect(transitionRelease).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "推进到 VALIDATED" }),
    );

    await waitFor(() =>
      expect(transitionRelease).toHaveBeenCalledWith(
        "corpus-v8",
        "VALIDATED",
      ),
    );
    expect(confirm).toHaveBeenCalledWith(
      "确认将 corpus-v8 推进到 VALIDATED？",
    );
    expect(
      await screen.findByRole("button", { name: "推进到 PUBLISHED" }),
    ).toBeTruthy();
  });

  it("reports permission failure without clearing the snapshot form", async () => {
    const createRelease = vi
      .fn()
      .mockRejectedValue(new HttpError(403, "forbidden"));
    render(
      <ReleaseCenterPage
        port={portWith({ createRelease })}
        roles={["PUBLISHER"]}
      />,
    );
    await screen.findByText("corpus-v8");

    fireEvent.change(screen.getByLabelText("发布版本"), {
      target: { value: "corpus-v9" },
    });
    fireEvent.change(screen.getByLabelText("掌握规则版本"), {
      target: { value: "mastery-v3" },
    });
    fireEvent.change(screen.getByLabelText("晋级规则版本"), {
      target: { value: "progression-v2" },
    });
    fireEvent.change(screen.getByLabelText("内容等级规则版本"), {
      target: { value: "level-v4" },
    });
    fireEvent.change(screen.getByLabelText("最低客户端版本"), {
      target: { value: "2.9.0" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "创建发布快照" }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "没有发布操作权限",
    );
    expect(screen.getByLabelText("发布版本").getAttribute("value")).toBe(
      "corpus-v9",
    );
  });

  it("shows immutable content revisions and registered artifacts in detail", async () => {
    const detailedRelease: ReleaseDetail = {
      ...draftDetail,
      artifacts: [
        {
          releaseVersion: "corpus-v8",
          level: "L1",
          artifactUrl: "https://cdn.test/L1.tar.gz",
          sha256: "a".repeat(64),
          fileSize: 100,
          format: "tar+gzip",
          masteryRuleVersion: "mastery-v3",
          progressionRuleVersion: "progression-v2",
          contentLevelRuleVersion: "level-v4",
          minClientVersion: "2.8.0",
        },
      ],
      items: [
        {
          id: "hz-yue-月",
          type: "CHARACTER",
          level: "L1",
          difficulty: "L1",
          promotionRequired: true,
          tags: ["nature"],
          payload: {
            char: "月",
            pinyin: "yuè",
            imageId: "img-moon",
            theme: "nature",
            strokes: 4,
          },
          status: "ACTIVE",
          revision: 7,
        },
      ],
    };
    render(
      <ReleaseCenterPage
        port={portWith({
          getRelease: vi.fn().mockResolvedValue(detailedRelease),
        })}
        roles={["PUBLISHER"]}
      />,
    );
    await screen.findByText("corpus-v8");
    fireEvent.click(screen.getByRole("button", { name: "查看 corpus-v8" }));

    expect(await screen.findByText("hz-yue-月")).toBeTruthy();
    expect(screen.getByText("修订 7")).toBeTruthy();
    expect(screen.getByText("https://cdn.test/L1.tar.gz")).toBeTruthy();
    expect(screen.getByText("100 bytes · tar+gzip")).toBeTruthy();
  });

  it("keeps release details read-only without PUBLISHER", async () => {
    render(<ReleaseCenterPage port={portWith()} roles={["REVIEWER"]} />);

    await screen.findByText("corpus-v8");
    expect(
      screen.queryByRole("heading", { name: "创建发布快照" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "查看 corpus-v8" }));
    expect(
      await screen.findByRole("heading", { name: "corpus-v8 详情" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "推进到 VALIDATED" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "登记 L1-L5 制品" }),
    ).toBeNull();
  });
});
