// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentEditor } from "../src/components/ContentEditor";
import type { ContentForm } from "../src/content-form";

const common = {
  id: "content-1",
  level: "L2" as const,
  difficulty: "L3" as const,
  promotionRequired: true,
  tagsText: "经典",
  expectedRevision: 2,
};

afterEach(cleanup);

describe("ContentEditor", () => {
  it("renders character fields, reports field issues and emits form changes", () => {
    const form: ContentForm = {
      type: "CHARACTER",
      ...common,
      char: "月",
      pinyin: "yuè",
      imageId: "img-moon",
      theme: "nature",
      strokes: 4,
    };
    const onChange = vi.fn();
    const onSave = vi.fn();
    const onValidate = vi.fn();
    const onActivate = vi.fn();
    const onArchive = vi.fn();
    const onClose = vi.fn();

    render(
      <ContentEditor
        actualRevision={null}
        canEdit
        canReview
        commandStatus="idle"
        fieldIssues={{ "/payload/pinyin": ["拼音格式错误"] }}
        form={form}
        notice={null}
        onActivate={onActivate}
        onArchive={onArchive}
        onChange={onChange}
        onClose={onClose}
        onSave={onSave}
        onValidate={onValidate}
      />,
    );

    expect(screen.getByLabelText("汉字").getAttribute("value")).toBe("月");
    expect(screen.getByLabelText("拼音").getAttribute("value")).toBe("yuè");
    expect(screen.getByText("拼音格式错误").getAttribute("role")).toBe("alert");
    expect(screen.queryByLabelText("作者")).toBeNull();

    fireEvent.change(screen.getByLabelText("拼音"), {
      target: { value: "yue" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...form, pinyin: "yue" });
    fireEvent.change(screen.getByLabelText("汉字"), {
      target: { value: "日" },
    });
    fireEvent.change(screen.getByLabelText("图片 ID"), {
      target: { value: "img-sun" },
    });
    fireEvent.change(screen.getByLabelText("主题"), {
      target: { value: "world" },
    });
    fireEvent.change(screen.getByLabelText("笔画"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存内容" }));
    fireEvent.click(screen.getByRole("button", { name: "校验内容" }));
    fireEvent.click(screen.getByRole("button", { name: "激活内容" }));
    fireEvent.click(screen.getByRole("button", { name: "归档内容" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭编辑器" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onValidate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders poem and idiom fields without leaking fields across types", () => {
    const poem: ContentForm = {
      type: "POEM",
      ...common,
      expectedRevision: null,
      title: "静夜思",
      author: "李白",
      linesText: "床前明月光",
      charRefsText: "hz-yue-月",
    };
    const view = render(
      <ContentEditor
        actualRevision={3}
        canEdit
        canReview
        commandStatus="idle"
        fieldIssues={{}}
        form={poem}
        notice="内容已被其他人更新"
        onActivate={vi.fn()}
        onArchive={vi.fn()}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onValidate={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("作者").getAttribute("value")).toBe("李白");
    expect(screen.getByLabelText("诗句（每行一条）")).toBeTruthy();
    expect(screen.getByText("服务端当前修订：3")).toBeTruthy();
    expect(screen.queryByLabelText("成语")).toBeNull();
    fireEvent.change(screen.getByLabelText("内容 ID"), {
      target: { value: "poem-2" },
    });
    fireEvent.change(screen.getByLabelText("等级"), {
      target: { value: "L3" },
    });
    fireEvent.change(screen.getByLabelText("难度"), {
      target: { value: "L4" },
    });
    fireEvent.change(screen.getByLabelText("标签"), {
      target: { value: "唐诗" },
    });
    fireEvent.click(screen.getByLabelText("晋级必需"));
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "望庐山瀑布" },
    });
    fireEvent.change(screen.getByLabelText("作者"), {
      target: { value: "杜甫" },
    });
    fireEvent.change(screen.getByLabelText("诗句（每行一条）"), {
      target: { value: "日照香炉生紫烟" },
    });
    fireEvent.change(screen.getByLabelText("汉字引用（逗号或换行）"), {
      target: { value: "hz-ri-日" },
    });

    const idiom: ContentForm = {
      type: "IDIOM",
      ...common,
      text: "一心一意",
      meaning: "专心",
      headPinyin: "yi",
      tailPinyin: "yi",
    };
    view.rerender(
      <ContentEditor
        actualRevision={null}
        canEdit
        canReview
        commandStatus="idle"
        fieldIssues={{}}
        form={idiom}
        notice={null}
        onActivate={vi.fn()}
        onArchive={vi.fn()}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onValidate={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("成语").getAttribute("value")).toBe("一心一意");
    expect(screen.getByLabelText("释义")).toBeTruthy();
    expect(screen.queryByLabelText("作者")).toBeNull();
    fireEvent.change(screen.getByLabelText("成语"), {
      target: { value: "全心全意" },
    });
    fireEvent.change(screen.getByLabelText("释义"), {
      target: { value: "投入全部精力" },
    });
    fireEvent.change(screen.getByLabelText("首字拼音"), {
      target: { value: "quan" },
    });
    fireEvent.change(screen.getByLabelText("尾字拼音"), {
      target: { value: "xin" },
    });
  });
});
