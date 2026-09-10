import type {
  AdminOperationsPort,
  ContentLevelValue,
  ReleaseDetail,
  ReleaseSearchQuery,
  ReleaseStatus,
  ReleaseSummary,
} from "@cc/api-client";
import { HttpError } from "@cc/api-client";
import { useEffect, useState } from "react";
import {
  nextReleaseStatus,
  ReleaseFormError,
  toArtifactInputs,
  toCreateReleaseRequest,
  type ArtifactFormRow,
  type CreateReleaseFormData,
} from "./release-form";

const EMPTY_CREATE_FORM: CreateReleaseFormData = {
  version: "",
  masteryRuleVersion: "",
  progressionRuleVersion: "",
  contentLevelRuleVersion: "",
  minClientVersion: "",
};

function emptyArtifactRows(): ArtifactFormRow[] {
  return [1, 2, 3, 4, 5].map((level) => ({
    level: level as ContentLevelValue,
    artifactUrl: "",
    sha256: "",
    fileSize: "",
  }));
}

interface ReleasePageState {
  listStatus: "loading" | "ready" | "error";
  loadingMore: boolean;
  loadMoreError: boolean;
  items: ReleaseSummary[];
  nextCursor: string | null;
  message: string | null;
}

function operationErrorMessage(error: unknown): string {
  if (error instanceof ReleaseFormError) return error.message;
  if (error instanceof HttpError) {
    if (error.status === 400) return "请求无效，请检查表单";
    if (error.status === 403) return "没有发布操作权限";
    if (error.status === 409) return "发布状态已变化，请刷新后重试";
  }
  return "操作失败，请重试";
}

export function useReleases(port: AdminOperationsPort) {
  const [statusFilter, setStatusFilter] = useState<ReleaseStatus | "">("");
  const [retryKey, setRetryKey] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [detailStatus, setDetailStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [detail, setDetail] = useState<ReleaseDetail | null>(null);
  const [createForm, setCreateForm] =
    useState<CreateReleaseFormData>(EMPTY_CREATE_FORM);
  const [artifactRows, setArtifactRows] =
    useState<ArtifactFormRow[]>(emptyArtifactRows);
  const [mutationStatus, setMutationStatus] = useState<
    "idle" | "creating" | "registering" | "transitioning"
  >("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<
    "success" | "error" | null
  >(null);
  const [pageState, setPageState] = useState<ReleasePageState>({
    listStatus: "loading",
    loadingMore: false,
    loadMoreError: false,
    items: [],
    nextCursor: null,
    message: null,
  });

  useEffect(() => {
    const query: ReleaseSearchQuery = { limit: 20 };
    if (statusFilter !== "") query.status = statusFilter;
    setPageState({
      listStatus: "loading",
      loadingMore: false,
      loadMoreError: false,
      items: [],
      nextCursor: null,
      message: null,
    });
    void port.searchReleases(query).then(
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
          message: "无法加载发布记录，请重试",
        });
      },
    );
  }, [port, retryKey, statusFilter]);

  async function loadNext() {
    if (pageState.nextCursor === null) return;
    setPageState((current) => ({
      ...current,
      loadingMore: true,
      loadMoreError: false,
      message: null,
    }));
    try {
      const query: ReleaseSearchQuery = {
        cursor: pageState.nextCursor,
        limit: 20,
      };
      if (statusFilter !== "") query.status = statusFilter;
      const page = await port.searchReleases(query);
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
        message: "无法加载下一页发布记录，请重试",
      }));
    }
  }

  async function selectRelease(version: string) {
    setSelectedVersion(version);
    setDetailStatus("loading");
    setDetail(null);
    setArtifactRows(emptyArtifactRows());
    setNotice(null);
    setNoticeKind(null);
    try {
      const selected = await port.getRelease(version);
      setDetail(selected);
      setDetailStatus("ready");
    } catch {
      setDetailStatus("error");
    }
  }

  async function createRelease() {
    setMutationStatus("creating");
    setNotice(null);
    setNoticeKind(null);
    try {
      const created = await port.createRelease(
        toCreateReleaseRequest(createForm),
      );
      setSelectedVersion(created.version);
      setDetail(created);
      setDetailStatus("ready");
      setCreateForm(EMPTY_CREATE_FORM);
      setNotice("发布快照已创建");
      setNoticeKind("success");
      setRetryKey((current) => current + 1);
    } catch (error) {
      setNotice(operationErrorMessage(error));
      setNoticeKind("error");
    } finally {
      setMutationStatus("idle");
    }
  }

  function updateArtifactRow(
    level: ContentLevelValue,
    fields: Partial<Omit<ArtifactFormRow, "level">>,
  ) {
    setArtifactRows((current) =>
      current.map((row) =>
        row.level === level ? { ...row, ...fields } : row,
      ),
    );
  }

  async function registerArtifacts() {
    if (selectedVersion === null) return;
    setMutationStatus("registering");
    setNotice(null);
    setNoticeKind(null);
    try {
      await port.registerArtifacts(
        selectedVersion,
        toArtifactInputs(artifactRows),
      );
      const refreshed = await port.getRelease(selectedVersion);
      setDetail(refreshed);
      setDetailStatus("ready");
      setArtifactRows(emptyArtifactRows());
      setNotice("五级制品已登记");
      setNoticeKind("success");
      setRetryKey((current) => current + 1);
    } catch (error) {
      setNotice(operationErrorMessage(error));
      setNoticeKind("error");
    } finally {
      setMutationStatus("idle");
    }
  }

  async function transitionRelease() {
    if (detail === null) return;
    const target = nextReleaseStatus(detail.status);
    if (target === null) return;
    setMutationStatus("transitioning");
    setNotice(null);
    setNoticeKind(null);
    try {
      await port.transitionRelease(detail.version, target);
      const refreshed = await port.getRelease(detail.version);
      setDetail(refreshed);
      setDetailStatus("ready");
      setNotice(`状态已推进到 ${target}`);
      setNoticeKind("success");
      setRetryKey((current) => current + 1);
    } catch (error) {
      setNotice(operationErrorMessage(error));
      setNoticeKind("error");
    } finally {
      setMutationStatus("idle");
    }
  }

  return {
    state: {
      ...pageState,
      statusFilter,
      selectedVersion,
      detailStatus,
      detail,
      createForm,
      artifactRows,
      mutationStatus,
      notice,
      noticeKind,
    },
    commands: {
      createRelease,
      loadNext,
      retryList: () => setRetryKey((current) => current + 1),
      registerArtifacts,
      selectRelease,
      setStatusFilter,
      transitionRelease,
      updateArtifactRow,
      updateCreateForm: setCreateForm,
    },
  };
}
