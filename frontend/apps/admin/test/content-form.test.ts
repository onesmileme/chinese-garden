import type { AdminContentItem } from "@cc/api-client";
import { describe, expect, it } from "vitest";
import {
  fromAdminContentItem,
  toSaveContentDraft,
  type ContentForm,
} from "../src/content-form";

describe("content form conversion", () => {
  it("converts an idiom form and normalizes common fields", () => {
    expect(
      toSaveContentDraft({
        type: "IDIOM",
        id: " cy-yixin-yiyi ",
        level: "L2",
        difficulty: "L3",
        promotionRequired: true,
        tagsText: " 品格, 成长,品格 ",
        expectedRevision: 4,
        text: " 一心一意 ",
        meaning: " 专心 ",
        headPinyin: " yi ",
        tailPinyin: " yi ",
      }),
    ).toEqual({
      id: "cy-yixin-yiyi",
      type: "IDIOM",
      level: "L2",
      difficulty: "L3",
      promotionRequired: true,
      tags: ["品格", "成长"],
      payload: {
        text: "一心一意",
        meaning: "专心",
        headPinyin: "yi",
        tailPinyin: "yi",
      },
    });
  });

  it("converts a character form into its typed payload", () => {
    expect(
      toSaveContentDraft({
        type: "CHARACTER",
        id: "hz-yue-月",
        level: "L1",
        difficulty: "L2",
        promotionRequired: false,
        tagsText: "",
        expectedRevision: null,
        char: " 月 ",
        pinyin: " yuè ",
        imageId: " img-moon ",
        theme: " nature ",
        strokes: 4,
      }),
    ).toEqual({
      id: "hz-yue-月",
      type: "CHARACTER",
      level: "L1",
      difficulty: "L2",
      promotionRequired: false,
      tags: [],
      payload: {
        char: "月",
        pinyin: "yuè",
        imageId: "img-moon",
        theme: "nature",
        strokes: 4,
      },
    });
  });

  it("parses poem lines and deduplicates character references", () => {
    expect(
      toSaveContentDraft({
        type: "POEM",
        id: "sc-jingyesi",
        level: "L2",
        difficulty: "L2",
        promotionRequired: true,
        tagsText: "月亮",
        expectedRevision: 2,
        title: " 静夜思 ",
        author: " 李白 ",
        linesText: "床前明月光\n\n 疑是地上霜 ",
        charRefsText: "hz-yue-月, hz-guang-光\nhz-yue-月",
      }),
    ).toEqual({
      id: "sc-jingyesi",
      type: "POEM",
      level: "L2",
      difficulty: "L2",
      promotionRequired: true,
      tags: ["月亮"],
      payload: {
        title: "静夜思",
        author: "李白",
        lines: ["床前明月光", "疑是地上霜"],
        charRefs: ["hz-yue-月", "hz-guang-光"],
      },
    });
  });

  it.each([
    [
      "CHARACTER",
      {
        char: "月",
        pinyin: "yuè",
        imageId: "img-moon",
        theme: "nature",
        strokes: 4,
      },
      {
        char: "月",
        pinyin: "yuè",
        imageId: "img-moon",
        theme: "nature",
        strokes: 4,
      },
    ],
    [
      "POEM",
      {
        title: "静夜思",
        author: "李白",
        lines: ["床前明月光", "疑是地上霜"],
        charRefs: ["hz-yue-月", "hz-guang-光"],
      },
      {
        title: "静夜思",
        author: "李白",
        linesText: "床前明月光\n疑是地上霜",
        charRefsText: "hz-yue-月\nhz-guang-光",
      },
    ],
    [
      "IDIOM",
      {
        text: "一心一意",
        meaning: "专心",
        headPinyin: "yi",
        tailPinyin: "yi",
      },
      {
        text: "一心一意",
        meaning: "专心",
        headPinyin: "yi",
        tailPinyin: "yi",
      },
    ],
  ] as const)(
    "creates an editable %s form and preserves its revision",
    (type, payload, typeFields) => {
      const item: AdminContentItem = {
        id: "content-1",
        type,
        level: "L2",
        difficulty: "L3",
        promotionRequired: true,
        tags: ["经典", "启蒙"],
        payload,
        status: "DRAFT",
        revision: 7,
      };

      expect(fromAdminContentItem(item)).toEqual({
        type,
        id: "content-1",
        level: "L2",
        difficulty: "L3",
        promotionRequired: true,
        tagsText: "经典, 启蒙",
        expectedRevision: 7,
        ...typeFields,
      } as ContentForm);
    },
  );
});
