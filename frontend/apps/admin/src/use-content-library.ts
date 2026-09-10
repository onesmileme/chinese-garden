import type {
  AdminContentItem,
  AdminOperationsPort,
  ContentLevel,
  ContentIssue,
  ContentSearchQuery,
  ContentStatus,
  ContentType,
} from "@cc/api-client";
import { HttpError } from "@cc/api-client";
import { useEffect, useState } from "react";
import {
  fromAdminContentItem,
  toSaveContentDraft,
  type ContentForm,
} from "./content-form";

export interface ContentFilters {
  level: ContentLevel | "";
  status: ContentStatus | "";
  tag: string;
  keyword: string;
}

interface ContentPageState {
  listStatus: "loading" | "ready" | "error";
  loadingMore: boolean;
  loadMoreError: boolean;
  items: AdminContentItem[];
  nextCursor: string | null;
  message: string | null;
}

function toQuery(
  type: ContentType,
  filters: ContentFilters,
  cursor?: string,
): ContentSearchQuery {
  const query: ContentSearchQuery = { type, limit: 20 };
  if (filters.level !== "") query.level = filters.level;
  if (filters.status !== "") query.status = filters.status;
  if (filters.tag !== "") query.tag = filters.tag;
  if (filters.keyword !== "") query.keyword = filters.keyword;
  if (cursor !== undefined) query.cursor = cursor;
  return query;
}

function indexIssues(issues: ContentIssue[]): Record<string, string[]> {
  return issues.reduce<Record<string, string[]>>((indexed, issue) => {
    indexed[issue.path] = [
      ...(indexed[issue.path] ?? []),
      issue.message,
    ];
    return indexed;
  }, {});
}

export function useContentLibrary(port: AdminOperationsPort) {
  const [type, setType] = useState<ContentType>("CHARACTER");
  const [filters, setFilters] = useState<ContentFilters>({
    level: "",
    status: "",
    tag: "",
    keyword: "",
  });
  const [retryKey, setRetryKey] = useState(0);
  const [form, setForm] = useState<ContentForm | null>(null);
  const [fieldIssues, setFieldIssues] = useState<Record<string, string[]>>({});
  const [actualRevision, setActualRevision] = useState<number | null>(null);
  const [commandStatus, setCommandStatus] = useState<
    "idle" | "saving" | "validating" | "activating" | "archiving"
  >("idle");
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [pageState, setPageState] = useState<ContentPageState>({
    listStatus: "loading",
    loadingMore: false,
    loadMoreError: false,
    items: [],
    nextCursor: null,
    message: null,
  });

  useEffect(() => {
    setPageState({
      listStatus: "loading",
      loadingMore: false,
      loadMoreError: false,
      items: [],
      nextCursor: null,
      message: null,
    });
    void port.searchContent(toQuery(type, filters)).then(
      (page) => {
        setPageState({
          listStatus: "ready",
          loadingMore: false,
          loadMoreError: false,
          items: page.items,
          nextCursor: page.nextCursor,
          message: null,
        });
      },
      () => {
        setPageState({
          listStatus: "error",
          loadingMore: false,
          loadMoreError: false,
          items: [],
          nextCursor: null,
          message: "无法加载内容，请重试",
        });
      },
    );
  }, [
    filters.keyword,
    filters.level,
    filters.status,
    filters.tag,
    port,
    retryKey,
    type,
  ]);

  function setFilter(
    name: keyof ContentFilters,
    value: ContentFilters[keyof ContentFilters],
  ) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function loadNext() {
    if (pageState.nextCursor === null) return;
    setPageState((current) => ({
      ...current,
      loadingMore: true,
      loadMoreError: false,
      message: null,
    }));
    try {
      const page = await port.searchContent(
        toQuery(type, filters, pageState.nextCursor),
      );
      setPageState((current) => ({
        listStatus: "ready",
        loadingMore: false,
        loadMoreError: false,
        items: [...current.items, ...page.items],
        nextCursor: page.nextCursor,
        message: null,
      }));
    } catch {
      setPageState((current) => ({
        ...current,
        loadingMore: false,
        loadMoreError: true,
        message: "无法加载下一页内容，请重试",
      }));
    }
  }

  function startCreate() {
    const common = {
      id: "",
      level: "L1",
      difficulty: "L1",
      promotionRequired: true,
      tagsText: "",
      expectedRevision: null,
    } as const;
    if (type === "CHARACTER") {
      setForm({
        type,
        ...common,
        char: "",
        pinyin: "",
        imageId: "",
        theme: "",
        strokes: 1,
      });
    } else if (type === "POEM") {
      setForm({
        type,
        ...common,
        title: "",
        author: "",
        linesText: "",
        charRefsText: "",
      });
    } else {
      setForm({
        type,
        ...common,
        text: "",
        meaning: "",
        headPinyin: "",
        tailPinyin: "",
      });
    }
    setFieldIssues({});
    setActualRevision(null);
    setOperationMessage(null);
  }

  function edit(item: AdminContentItem) {
    setForm(fromAdminContentItem(item));
    setFieldIssues({});
    setActualRevision(null);
    setOperationMessage(null);
  }

  function closeEditor() {
    setForm(null);
    setFieldIssues({});
    setActualRevision(null);
    setOperationMessage(null);
  }

  function handleCommandError(error: unknown) {
    if (error instanceof HttpError && error.status === 409) {
      const body = error.body as {
        code: string;
        details: { actualRevision: number };
      };
      if (body.code === "CONTENT_REVISION_CONFLICT") {
        setActualRevision(body.details.actualRevision);
        setOperationMessage(
          `内容已被其他人更新，当前修订为 ${body.details.actualRevision}`,
        );
        return;
      }
    }
    if (error instanceof HttpError && error.status === 422) {
      const body = error.body as { details: ContentIssue[] };
      setFieldIssues(indexIssues(body.details));
      setOperationMessage("内容校验失败，请检查标记字段");
      return;
    }
    setOperationMessage("操作失败，请重试");
  }

  async function save() {
    if (form === null) return;
    setCommandStatus("saving");
    setFieldIssues({});
    setActualRevision(null);
    setOperationMessage(null);
    try {
      const draft = toSaveContentDraft(form);
      const saved =
        form.expectedRevision === null
          ? await port.createContent(draft)
          : await port.updateContent(
              form.id,
              form.expectedRevision,
              draft,
            );
      setForm(fromAdminContentItem(saved));
      setOperationMessage(
        form.expectedRevision === null ? "内容已创建" : "内容已保存",
      );
      setRetryKey((current) => current + 1);
    } catch (error) {
      handleCommandError(error);
    } finally {
      setCommandStatus("idle");
    }
  }

  async function validate() {
    if (form === null) return;
    setCommandStatus("validating");
    setFieldIssues({});
    setOperationMessage(null);
    try {
      const result = await port.validateContent(form.id);
      setFieldIssues(indexIssues(result.issues));
      setOperationMessage(
        result.valid ? "内容校验通过" : `发现 ${result.issues.length} 个校验问题`,
      );
    } catch (error) {
      handleCommandError(error);
    } finally {
      setCommandStatus("idle");
    }
  }

  async function activate() {
    if (form === null || form.expectedRevision === null) return;
    setCommandStatus("activating");
    setOperationMessage(null);
    try {
      const activated = await port.activateContent(
        form.id,
        form.expectedRevision,
      );
      setForm(fromAdminContentItem(activated));
      setOperationMessage("内容已激活");
      setRetryKey((current) => current + 1);
    } catch (error) {
      handleCommandError(error);
    } finally {
      setCommandStatus("idle");
    }
  }

  async function archive() {
    if (form === null || form.expectedRevision === null) return;
    setCommandStatus("archiving");
    setOperationMessage(null);
    try {
      const archived = await port.archiveContent(
        form.id,
        form.expectedRevision,
      );
      setForm(fromAdminContentItem(archived));
      setOperationMessage("内容已归档");
      setRetryKey((current) => current + 1);
    } catch (error) {
      handleCommandError(error);
    } finally {
      setCommandStatus("idle");
    }
  }

  return {
    state: {
      ...pageState,
      message: operationMessage ?? pageState.message,
      notice: operationMessage,
      type,
      filters,
      form,
      fieldIssues,
      actualRevision,
      commandStatus,
    },
    commands: {
      selectType: setType,
      setFilter,
      loadNext,
      retry: () => setRetryKey((current) => current + 1),
      startCreate,
      edit,
      updateForm: setForm,
      closeEditor,
      save,
      validate,
      activate,
      archive,
    },
  };
}
