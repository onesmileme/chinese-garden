// @vitest-environment happy-dom

import type {
  AdminContentItem,
  AdminOperationsPort,
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
import { ContentLibraryPage } from "../src/pages/ContentLibraryPage";

const character: AdminContentItem = {
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
  status: "DRAFT",
  revision: 1,
};

const poem: AdminContentItem = {
  ...character,
  id: "sc-jingyesi",
  type: "POEM",
  payload: {
    title: "静夜思",
    author: "李白",
    lines: ["床前明月光"],
    charRefs: ["hz-yue-月"],
  },
};

const idiom: AdminContentItem = {
  ...character,
  id: "cy-yixinyiyi",
  type: "IDIOM",
  payload: {
    text: "一心一意",
    meaning: "专心",
    headPinyin: "yi",
    tailPinyin: "yi",
  },
};

function portWith(
  overrides: Partial<AdminOperationsPort> = {},
): AdminOperationsPort {
  return {
    searchContent: vi.fn().mockResolvedValue({
      items: [character],
      nextCursor: "cursor-2",
    }),
    ...overrides,
  } as AdminOperationsPort;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ContentLibraryPage", () => {
  it("supports dense browsing, filtering, pagination and editor entry points", async () => {
    const second = {
      ...character,
      id: "hz-guang-光",
      payload: { ...character.payload, char: "光" },
    };
    const searchContent = vi.fn(async (query: { cursor?: string }) =>
      query.cursor === undefined
        ? { items: [character, poem, idiom], nextCursor: "cursor-2" }
        : { items: [second], nextCursor: null },
    );
    const port = portWith({ searchContent });

    render(<ContentLibraryPage port={port} roles={["ADMIN"]} />);

    expect(screen.getByRole("status").textContent).toBe("正在加载内容…");
    expect((await screen.findByText("hz-yue-月")).textContent).toBe(
      "hz-yue-月",
    );
    expect(screen.getByText("静夜思")).toBeTruthy();
    expect(screen.getByText("一心一意")).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "汉字" }).getAttribute("aria-selected"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "编辑 月" }));
    expect(screen.getByLabelText("拼音").getAttribute("value")).toBe("yuè");
    fireEvent.click(screen.getByRole("button", { name: "关闭编辑器" }));

    fireEvent.click(screen.getByRole("button", { name: "新建内容" }));
    expect(screen.getByRole("heading", { name: "新建 CHARACTER" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭编辑器" }));

    fireEvent.click(screen.getByRole("tab", { name: "古诗词" }));
    fireEvent.change(screen.getByLabelText("等级"), {
      target: { value: "L2" },
    });
    fireEvent.change(screen.getByLabelText("状态"), {
      target: { value: "DRAFT" },
    });
    fireEvent.change(screen.getByLabelText("标签"), {
      target: { value: "经典" },
    });
    fireEvent.change(screen.getByLabelText("关键词"), {
      target: { value: "月" },
    });

    await waitFor(() =>
      expect(searchContent).toHaveBeenLastCalledWith({
        type: "POEM",
        level: "L2",
        status: "DRAFT",
        tag: "经典",
        keyword: "月",
        limit: 20,
      }),
    );

    const searchCallCount = searchContent.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() =>
      expect(searchContent.mock.calls.length).toBe(searchCallCount + 1),
    );
    expect(searchContent).toHaveBeenLastCalledWith({
      type: "POEM",
      level: "L2",
      status: "DRAFT",
      tag: "经典",
      keyword: "月",
      cursor: "cursor-2",
      limit: 20,
    });
  });

  it("retains edited input on 409 and then renders 422 issues at the field", async () => {
    const updateContent = vi
      .fn()
      .mockRejectedValueOnce(
        new HttpError(409, "conflict", {
          code: "CONTENT_REVISION_CONFLICT",
          details: { expectedRevision: 1, actualRevision: 4 },
        }),
      )
      .mockRejectedValueOnce(
        new HttpError(422, "invalid", {
          code: "CONTENT_FIELD_INVALID",
          details: [
            {
              code: "CONTENT_FIELD_INVALID",
              itemId: character.id,
              path: "/payload/pinyin",
              message: "拼音格式错误",
            },
          ],
        }),
      );
    render(
      <ContentLibraryPage
        port={portWith({ updateContent })}
        roles={["ADMIN"]}
      />,
    );
    await screen.findByText(character.id);
    fireEvent.click(screen.getByRole("button", { name: "编辑 月" }));
    fireEvent.change(screen.getByLabelText("拼音"), {
      target: { value: "user-edit" },
    });

    fireEvent.click(screen.getByRole("button", { name: "保存内容" }));
    expect(await screen.findByText("服务端当前修订：4")).toBeTruthy();
    expect(screen.getByLabelText("拼音").getAttribute("value")).toBe(
      "user-edit",
    );

    fireEvent.click(screen.getByRole("button", { name: "保存内容" }));
    expect(await screen.findByText("拼音格式错误")).toBeTruthy();
    expect(screen.getByLabelText("拼音").getAttribute("value")).toBe(
      "user-edit",
    );
  });

  it("shows a retry control when loading the next page fails", async () => {
    const searchContent = vi
      .fn()
      .mockResolvedValueOnce({
        items: [character],
        nextCursor: "cursor-2",
      })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        items: [{ ...character, id: "hz-ri-日" }],
        nextCursor: null,
      });
    render(
      <ContentLibraryPage
        port={portWith({ searchContent })}
        roles={["ADMIN"]}
      />,
    );
    await screen.findByText(character.id);

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "无法加载下一页内容，请重试",
    );
    expect(screen.getByText(character.id)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "重试加载下一页内容" }),
    );

    expect(await screen.findByText("hz-ri-日")).toBeTruthy();
  });

  it("validates directly and confirms activation and archival", async () => {
    const active = { ...character, status: "ACTIVE" as const, revision: 2 };
    const archived = {
      ...character,
      status: "ARCHIVED" as const,
      revision: 3,
    };
    const validateContent = vi.fn().mockResolvedValue({
      valid: true,
      issues: [],
    });
    const activateContent = vi.fn().mockResolvedValue(active);
    const archiveContent = vi.fn().mockResolvedValue(archived);
    const confirm = vi
      .spyOn(globalThis, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    render(
      <ContentLibraryPage
        port={portWith({
          validateContent,
          activateContent,
          archiveContent,
        })}
        roles={["ADMIN"]}
      />,
    );
    await screen.findByText(character.id);
    fireEvent.click(screen.getByRole("button", { name: "编辑 月" }));

    fireEvent.click(screen.getByRole("button", { name: "校验内容" }));
    expect(await screen.findByText("内容校验通过")).toBeTruthy();
    expect(validateContent).toHaveBeenCalledWith(character.id);

    fireEvent.click(screen.getByRole("button", { name: "激活内容" }));
    expect(activateContent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "激活内容" }));
    await waitFor(() =>
      expect(activateContent).toHaveBeenCalledWith(character.id, 1),
    );

    fireEvent.click(screen.getByRole("button", { name: "归档内容" }));
    await waitFor(() =>
      expect(archiveContent).toHaveBeenCalledWith(character.id, 2),
    );
    expect(confirm).toHaveBeenCalledTimes(3);
  });

  it("limits editor actions to EDITOR capabilities", async () => {
    render(<ContentLibraryPage port={portWith()} roles={["EDITOR"]} />);

    await screen.findByText(character.id);
    expect(screen.getByRole("button", { name: "新建内容" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "编辑 月" }));

    expect(screen.getByRole("button", { name: "保存内容" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "归档内容" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "校验内容" })).toBeNull();
    expect(screen.queryByRole("button", { name: "激活内容" })).toBeNull();
  });

  it("lets REVIEWER inspect details, validate and activate without editing", async () => {
    render(<ContentLibraryPage port={portWith()} roles={["REVIEWER"]} />);

    await screen.findByText(character.id);
    expect(screen.queryByRole("button", { name: "新建内容" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看 月" }));

    expect(screen.getByRole("heading", { name: character.id })).toBeTruthy();
    expect(screen.getByRole("button", { name: "校验内容" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "激活内容" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存内容" })).toBeNull();
    expect(screen.queryByRole("button", { name: "归档内容" })).toBeNull();
    expect(
      (screen.getByRole("group", {
        name: "内容详情字段",
      }) as HTMLFieldSetElement).disabled,
    ).toBe(true);
  });
});
