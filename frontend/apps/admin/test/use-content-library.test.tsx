// @vitest-environment happy-dom

import type {
  AdminContentItem,
  AdminOperationsPort,
} from "@cc/api-client";
import { HttpError } from "@cc/api-client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContentLibrary } from "../src/use-content-library";

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

const secondCharacter: AdminContentItem = {
  ...character,
  id: "hz-guang-光",
  payload: { ...character.payload, char: "光" },
  revision: 2,
};

function createPort(
  overrides: Partial<AdminOperationsPort> = {},
): AdminOperationsPort {
  return {
    searchContent: vi.fn().mockResolvedValue({
      items: [character],
      nextCursor: "next-1",
    }),
    ...overrides,
  } as AdminOperationsPort;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useContentLibrary", () => {
  it("loads the first character page and exposes its result", async () => {
    const port = createPort();
    const { result } = renderHook(() => useContentLibrary(port));

    expect(result.current.state.listStatus).toBe("loading");
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    expect(port.searchContent).toHaveBeenCalledWith({
      type: "CHARACTER",
      limit: 20,
    });
    expect(result.current.state.items).toEqual([character]);
    expect(result.current.state.nextCursor).toBe("next-1");
  });

  it("reloads the first page when type and filters change", async () => {
    const searchContent = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const port = createPort({ searchContent });
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() => expect(searchContent).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.commands.selectType("POEM");
    });
    await waitFor(() =>
      expect(searchContent).toHaveBeenLastCalledWith({
        type: "POEM",
        limit: 20,
      }),
    );

    act(() => {
      result.current.commands.setFilter("level", "L2");
      result.current.commands.setFilter("status", "DRAFT");
      result.current.commands.setFilter("tag", "经典");
      result.current.commands.setFilter("keyword", "月");
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

    expect(result.current.state.type).toBe("POEM");
    expect(result.current.state.filters).toEqual({
      level: "L2",
      status: "DRAFT",
      tag: "经典",
      keyword: "月",
    });
  });

  it("appends the next cursor page to the current results", async () => {
    const searchContent = vi
      .fn()
      .mockResolvedValueOnce({
        items: [character],
        nextCursor: "next-1",
      })
      .mockResolvedValueOnce({
        items: [secondCharacter],
        nextCursor: null,
      });
    const port = createPort({ searchContent });
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() => expect(result.current.state.items).toHaveLength(1));

    await act(async () => {
      await result.current.commands.loadNext();
    });

    expect(searchContent).toHaveBeenLastCalledWith({
      type: "CHARACTER",
      cursor: "next-1",
      limit: 20,
    });
    expect(result.current.state.items).toEqual([
      character,
      secondCharacter,
    ]);
    expect(result.current.state.nextCursor).toBeNull();
  });

  it("preserves the current page and retries a failed next-page request", async () => {
    const searchContent = vi
      .fn()
      .mockResolvedValueOnce({
        items: [character],
        nextCursor: "next-1",
      })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        items: [secondCharacter],
        nextCursor: null,
      });
    const port = createPort({ searchContent });
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() => expect(result.current.state.items).toEqual([character]));

    await act(async () => {
      await result.current.commands.loadNext();
    });

    expect(result.current.state.listStatus).toBe("ready");
    expect(result.current.state.items).toEqual([character]);
    expect(result.current.state.nextCursor).toBe("next-1");
    expect(result.current.state.loadMoreError).toBe(true);
    expect(result.current.state.message).toBe(
      "无法加载下一页内容，请重试",
    );

    await act(async () => {
      await result.current.commands.loadNext();
    });

    expect(result.current.state.items).toEqual([
      character,
      secondCharacter,
    ]);
    expect(result.current.state.loadMoreError).toBe(false);
  });

  it("exposes a list error and retries the current query", async () => {
    const searchContent = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [character], nextCursor: null });
    const port = createPort({ searchContent });
    const { result } = renderHook(() => useContentLibrary(port));

    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("error"),
    );
    expect(result.current.state.message).toBe("无法加载内容，请重试");

    act(() => {
      result.current.commands.retry();
    });
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    expect(searchContent).toHaveBeenCalledTimes(2);
    expect(result.current.state.items).toEqual([character]);
  });

  it("starts a new character draft for the selected type", async () => {
    const port = createPort();
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    act(() => {
      result.current.commands.startCreate();
    });

    expect(result.current.state.form).toEqual({
      type: "CHARACTER",
      id: "",
      level: "L1",
      difficulty: "L1",
      promotionRequired: true,
      tagsText: "",
      expectedRevision: null,
      char: "",
      pinyin: "",
      imageId: "",
      theme: "",
      strokes: 1,
    });
    expect(result.current.state.fieldIssues).toEqual({});
    expect(result.current.state.actualRevision).toBeNull();
  });

  it("starts poem and idiom drafts with only their type-specific fields", async () => {
    const port = createPort();
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    act(() => {
      result.current.commands.selectType("POEM");
    });
    await waitFor(() => expect(result.current.state.type).toBe("POEM"));
    act(() => {
      result.current.commands.startCreate();
    });
    expect(result.current.state.form).toEqual({
      type: "POEM",
      id: "",
      level: "L1",
      difficulty: "L1",
      promotionRequired: true,
      tagsText: "",
      expectedRevision: null,
      title: "",
      author: "",
      linesText: "",
      charRefsText: "",
    });

    act(() => {
      result.current.commands.selectType("IDIOM");
    });
    await waitFor(() => expect(result.current.state.type).toBe("IDIOM"));
    act(() => {
      result.current.commands.startCreate();
    });
    expect(result.current.state.form).toEqual({
      type: "IDIOM",
      id: "",
      level: "L1",
      difficulty: "L1",
      promotionRequired: true,
      tagsText: "",
      expectedRevision: null,
      text: "",
      meaning: "",
      headPinyin: "",
      tailPinyin: "",
    });
  });

  it("opens, updates and closes an existing content form", async () => {
    const port = createPort();
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    act(() => {
      result.current.commands.edit(character);
    });
    expect(result.current.state.form).toMatchObject({
      type: "CHARACTER",
      id: "hz-yue-月",
      char: "月",
      expectedRevision: 1,
    });

    act(() => {
      const current = result.current.state.form;
      if (current?.type === "CHARACTER") {
        result.current.commands.updateForm({
          ...current,
          pinyin: "yue",
        });
      }
    });
    expect(result.current.state.form).toMatchObject({ pinyin: "yue" });

    act(() => {
      result.current.commands.closeEditor();
    });
    expect(result.current.state.form).toBeNull();
  });

  it("creates a draft, keeps the saved revision and refreshes the list", async () => {
    const created = { ...character, revision: 1 };
    const createContent = vi.fn().mockResolvedValue(created);
    const searchContent = vi
      .fn()
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [created], nextCursor: null });
    const port = createPort({ createContent, searchContent });
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    act(() => {
      result.current.commands.startCreate();
    });
    act(() => {
      const form = result.current.state.form;
      if (form?.type === "CHARACTER") {
        result.current.commands.updateForm({
          ...form,
          id: "hz-yue-月",
          char: "月",
          pinyin: "yuè",
          imageId: "img-moon",
          theme: "nature",
          tagsText: "nature",
          strokes: 4,
        });
      }
    });
    await act(async () => {
      await result.current.commands.save();
    });

    expect(createContent).toHaveBeenCalledWith({
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
    });
    expect(result.current.state.form?.expectedRevision).toBe(1);
    expect(result.current.state.notice).toBe("内容已创建");
    await waitFor(() => expect(searchContent).toHaveBeenCalledTimes(2));
  });


  it("creates a new draft and refreshes the current list", async () => {
    const created: AdminContentItem = {
      ...character,
      id: "hz-ri-日",
      payload: {
        char: "日",
        pinyin: "rì",
        imageId: "img-sun",
        theme: "nature",
        strokes: 4,
      },
      revision: 1,
    };
    const createContent = vi.fn().mockResolvedValue(created);
    const searchContent = vi
      .fn()
      .mockResolvedValueOnce({ items: [character], nextCursor: null })
      .mockResolvedValueOnce({ items: [character, created], nextCursor: null });
    const port = createPort({ createContent, searchContent });
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    act(() => {
      result.current.commands.startCreate();
      result.current.commands.updateForm({
        type: "CHARACTER",
        id: " hz-ri-日 ",
        level: "L1",
        difficulty: "L1",
        promotionRequired: true,
        tagsText: "自然",
        expectedRevision: null,
        char: " 日 ",
        pinyin: " rì ",
        imageId: " img-sun ",
        theme: " nature ",
        strokes: 4,
      });
    });
    await act(async () => {
      await result.current.commands.save();
    });

    expect(createContent).toHaveBeenCalledWith({
      id: "hz-ri-日",
      type: "CHARACTER",
      level: "L1",
      difficulty: "L1",
      promotionRequired: true,
      tags: ["自然"],
      payload: {
        char: "日",
        pinyin: "rì",
        imageId: "img-sun",
        theme: "nature",
        strokes: 4,
      },
    });
    expect(result.current.state.items).toEqual([character, created]);
    expect(result.current.state.form?.expectedRevision).toBe(1);
    expect(result.current.state.message).toBe("内容已创建");
    expect(result.current.state.commandStatus).toBe("idle");
  });

  it("updates an existing draft with its expected revision", async () => {
    const updated: AdminContentItem = {
      ...character,
      payload: { ...character.payload, pinyin: "yue" },
      revision: 2,
    };
    const updateContent = vi.fn().mockResolvedValue(updated);
    const searchContent = vi
      .fn()
      .mockResolvedValueOnce({ items: [character], nextCursor: null })
      .mockResolvedValueOnce({ items: [updated], nextCursor: null });
    const port = createPort({ searchContent, updateContent });
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() => expect(result.current.state.items).toEqual([character]));

    act(() => {
      result.current.commands.edit(character);
    });
    act(() => {
      const form = result.current.state.form;
      if (form?.type === "CHARACTER") {
        result.current.commands.updateForm({ ...form, pinyin: "yue" });
      }
    });
    await act(async () => {
      await result.current.commands.save();
    });

    expect(updateContent).toHaveBeenCalledWith(
      "hz-yue-月",
      1,
      expect.objectContaining({
        id: "hz-yue-月",
        payload: expect.objectContaining({ pinyin: "yue" }),
      }),
    );
    expect(result.current.state.form?.expectedRevision).toBe(2);
    expect(result.current.state.notice).toBe("内容已保存");
  });

  it("preserves the edited form and exposes the actual revision on 409", async () => {
    const updateContent = vi.fn().mockRejectedValue(
      new HttpError(409, "conflict", {
        code: "CONTENT_REVISION_CONFLICT",
        message: "content revision conflict",
        path: "/expectedRevision",
        details: { expectedRevision: 1, actualRevision: 3 },
      }),
    );
    const port = createPort({ updateContent });
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );
    act(() => {
      result.current.commands.edit(character);
    });
    act(() => {
      const form = result.current.state.form;
      if (form?.type === "CHARACTER") {
        result.current.commands.updateForm({ ...form, pinyin: "user-edit" });
      }
    });
    const editedForm = result.current.state.form;

    await act(async () => {
      await result.current.commands.save();
    });

    expect(result.current.state.form).toEqual(editedForm);
    expect(result.current.state.actualRevision).toBe(3);
    expect(result.current.state.message).toBe(
      "内容已被其他人更新，当前修订为 3",
    );
    expect(result.current.state.commandStatus).toBe("idle");
  });

  it("maps all 422 issues by JSON pointer while retaining the form", async () => {
    const updateContent = vi.fn().mockRejectedValue(
      new HttpError(422, "invalid", {
        code: "CONTENT_FIELD_INVALID",
        message: "content validation failed",
        path: "/payload/pinyin",
        details: [
          {
            code: "CONTENT_FIELD_INVALID",
            itemId: character.id,
            path: "/payload/pinyin",
            message: "拼音格式错误",
          },
          {
            code: "CONTENT_FIELD_INVALID",
            itemId: character.id,
            path: "/payload/pinyin",
            message: "拼音不能为空",
          },
          {
            code: "CONTENT_FIELD_INVALID",
            itemId: character.id,
            path: "/level",
            message: "等级不合法",
          },
        ],
      }),
    );
    const port = createPort({ updateContent });
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );
    act(() => {
      result.current.commands.edit(character);
    });
    const editedForm = result.current.state.form;

    await act(async () => {
      await result.current.commands.save();
    });

    expect(result.current.state.form).toEqual(editedForm);
    expect(result.current.state.fieldIssues).toEqual({
      "/payload/pinyin": ["拼音格式错误", "拼音不能为空"],
      "/level": ["等级不合法"],
    });
    expect(result.current.state.message).toBe(
      "内容校验失败，请检查标记字段",
    );
  });

  it("validates, activates and archives the current item with revision updates", async () => {
    const issue = {
      code: "CONTENT_FIELD_INVALID",
      itemId: character.id,
      path: "/payload/pinyin",
      message: "拼音格式错误",
    };
    const active = { ...character, status: "ACTIVE" as const, revision: 2 };
    const archived = {
      ...character,
      status: "ARCHIVED" as const,
      revision: 3,
    };
    const validateContent = vi.fn().mockResolvedValue({
      valid: false,
      issues: [issue],
    });
    const activateContent = vi.fn().mockResolvedValue(active);
    const archiveContent = vi.fn().mockResolvedValue(archived);
    const port = createPort({
      validateContent,
      activateContent,
      archiveContent,
    });
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );
    act(() => {
      result.current.commands.edit(character);
    });

    await act(async () => {
      await result.current.commands.validate();
    });
    expect(validateContent).toHaveBeenCalledWith(character.id);
    expect(result.current.state.fieldIssues).toEqual({
      "/payload/pinyin": ["拼音格式错误"],
    });
    expect(result.current.state.message).toBe("发现 1 个校验问题");

    await act(async () => {
      await result.current.commands.activate();
    });
    expect(activateContent).toHaveBeenCalledWith(character.id, 1);
    expect(result.current.state.form?.expectedRevision).toBe(2);
    expect(result.current.state.message).toBe("内容已激活");

    await act(async () => {
      await result.current.commands.archive();
    });
    expect(archiveContent).toHaveBeenCalledWith(character.id, 2);
    expect(result.current.state.form?.expectedRevision).toBe(3);
    expect(result.current.state.message).toBe("内容已归档");
  });

  it("keeps command failures observable and safely ignores commands without a selection", async () => {
    const validateContent = vi.fn().mockRejectedValue(new Error("offline"));
    const activateContent = vi.fn().mockRejectedValue(new Error("offline"));
    const archiveContent = vi.fn().mockRejectedValue(new Error("offline"));
    const updateContent = vi.fn().mockRejectedValue(
      new HttpError(409, "state conflict", {
        code: "ADMIN_STATE_CONFLICT",
        details: {},
      }),
    );
    const port = createPort({
      searchContent: vi.fn().mockResolvedValue({
        items: [character],
        nextCursor: null,
      }),
      validateContent,
      activateContent,
      archiveContent,
      updateContent,
    });
    const { result } = renderHook(() => useContentLibrary(port));
    await waitFor(() =>
      expect(result.current.state.listStatus).toBe("ready"),
    );

    await act(async () => {
      await result.current.commands.loadNext();
      await result.current.commands.save();
      await result.current.commands.validate();
      await result.current.commands.activate();
      await result.current.commands.archive();
    });
    expect(validateContent).not.toHaveBeenCalled();

    act(() => {
      result.current.commands.startCreate();
    });
    await act(async () => {
      await result.current.commands.activate();
      await result.current.commands.archive();
    });
    expect(activateContent).not.toHaveBeenCalled();

    act(() => {
      result.current.commands.edit(character);
    });
    await act(async () => {
      await result.current.commands.validate();
    });
    expect(result.current.state.message).toBe("操作失败，请重试");
    await act(async () => {
      await result.current.commands.activate();
    });
    expect(result.current.state.message).toBe("操作失败，请重试");
    await act(async () => {
      await result.current.commands.archive();
    });
    expect(result.current.state.message).toBe("操作失败，请重试");
    await act(async () => {
      await result.current.commands.save();
    });
    expect(result.current.state.message).toBe("操作失败，请重试");
  });
});
