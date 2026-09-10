import type {
  AdminContentItem,
  ContentLevel,
  SaveContentDraft,
} from "@cc/api-client";

interface CommonForm {
  id: string;
  level: ContentLevel;
  difficulty: ContentLevel;
  promotionRequired: boolean;
  tagsText: string;
  expectedRevision: number | null;
}

interface CharacterForm {
  char: string;
  pinyin: string;
  imageId: string;
  theme: string;
  strokes: number;
}

interface PoemForm {
  title: string;
  author: string;
  linesText: string;
  charRefsText: string;
}

interface IdiomForm {
  text: string;
  meaning: string;
  headPinyin: string;
  tailPinyin: string;
}

export type ContentForm =
  | ({ type: "CHARACTER" } & CommonForm & CharacterForm)
  | ({ type: "POEM" } & CommonForm & PoemForm)
  | ({ type: "IDIOM" } & CommonForm & IdiomForm);

function splitUnique(value: string, separator: string | RegExp): string[] {
  return [
    ...new Set(value.split(separator).map((part) => part.trim()).filter(Boolean)),
  ];
}

export function toSaveContentDraft(form: ContentForm): SaveContentDraft {
  let payload: Record<string, unknown>;
  if (form.type === "CHARACTER") {
    payload = {
      char: form.char.trim(),
      pinyin: form.pinyin.trim(),
      imageId: form.imageId.trim(),
      theme: form.theme.trim(),
      strokes: form.strokes,
    };
  } else if (form.type === "POEM") {
    payload = {
      title: form.title.trim(),
      author: form.author.trim(),
      lines: splitUnique(form.linesText, /\r?\n/),
      charRefs: splitUnique(form.charRefsText, /[,\r\n]+/),
    };
  } else {
    payload = {
      text: form.text.trim(),
      meaning: form.meaning.trim(),
      headPinyin: form.headPinyin.trim(),
      tailPinyin: form.tailPinyin.trim(),
    };
  }

  return {
    id: form.id.trim(),
    type: form.type,
    level: form.level,
    difficulty: form.difficulty,
    promotionRequired: form.promotionRequired,
    tags: splitUnique(form.tagsText, ","),
    payload,
  };
}

export function fromAdminContentItem(item: AdminContentItem): ContentForm {
  const common = {
    id: item.id,
    level: item.level,
    difficulty: item.difficulty,
    promotionRequired: item.promotionRequired,
    tagsText: item.tags.join(", "),
    expectedRevision: item.revision,
  };

  if (item.type === "CHARACTER") {
    const payload = item.payload as unknown as CharacterForm;
    return { type: item.type, ...common, ...payload };
  }
  if (item.type === "POEM") {
    const payload = item.payload as {
      title: string;
      author: string;
      lines: string[];
      charRefs: string[];
    };
    return {
      type: item.type,
      ...common,
      title: payload.title,
      author: payload.author,
      linesText: payload.lines.join("\n"),
      charRefsText: payload.charRefs.join("\n"),
    };
  }

  const payload = item.payload as unknown as IdiomForm;
  return { type: item.type, ...common, ...payload };
}
