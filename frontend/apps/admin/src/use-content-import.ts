import type {
  AdminOperationsPort,
  ImportBatch,
} from "@cc/api-client";
import { useRef, useState } from "react";
import {
  runCandidateImport,
  type ImportCheckpoint,
} from "./import/import-runner";
import {
  parseCandidateNdjson,
  type ParsedCandidates,
} from "./import/parse-candidates";

export interface ImportFileMetadata {
  name: string;
  size: number;
}

type ContentImportStatus =
  | "idle"
  | "ready"
  | "invalid"
  | "running"
  | "failed"
  | "completed";

interface ContentImportState {
  status: ContentImportStatus;
  file: ImportFileMetadata | null;
  candidateCount: number;
  checkpoint: ImportCheckpoint | null;
  batch: ImportBatch | null;
  message: string | null;
}

const initialState: ContentImportState = {
  status: "idle",
  file: null,
  candidateCount: 0,
  checkpoint: null,
  batch: null,
  message: null,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "文件解析失败";
}

export function useContentImport(port: AdminOperationsPort) {
  const [state, setState] = useState(initialState);
  const [parsed, setParsed] = useState<ParsedCandidates | null>(null);
  const running = useRef(false);

  function selectFile(
    file: ImportFileMetadata,
    source: string,
  ): void {
    if (running.current) return;
    try {
      const nextParsed = parseCandidateNdjson(source);
      setParsed(nextParsed);
      setState({
        status: "ready",
        file,
        candidateCount: nextParsed.candidates.length,
        checkpoint: null,
        batch: null,
        message: null,
      });
    } catch (error) {
      setParsed(null);
      setState({
        status: "invalid",
        file,
        candidateCount: 0,
        checkpoint: null,
        batch: null,
        message: errorMessage(error),
      });
    }
  }

  async function execute(
    parsedCandidates: ParsedCandidates,
    checkpoint: ImportCheckpoint | null,
  ): Promise<void> {
    setState((current) => ({
      ...current,
      status: "running",
      message: null,
    }));
    try {
      const batch = await runCandidateImport(
        port,
        parsedCandidates,
        checkpoint,
        (nextCheckpoint) => {
          setState((current) => ({
            ...current,
            checkpoint: nextCheckpoint,
          }));
        },
      );
      setState((current) => ({
        ...current,
        status: "completed",
        batch,
        message: "导入完成",
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "failed",
        message: `导入失败：${errorMessage(error)}`,
      }));
    } finally {
      running.current = false;
    }
  }

  function begin(checkpoint: ImportCheckpoint | null): Promise<void> {
    if (running.current) return Promise.resolve();
    running.current = true;
    return execute(parsed!, checkpoint);
  }

  function start(): Promise<void> {
    if (state.status !== "ready") return Promise.resolve();
    return begin(null);
  }

  function retry(): Promise<void> {
    if (state.status !== "failed" || state.checkpoint === null) {
      return Promise.resolve();
    }
    return begin(state.checkpoint);
  }

  return {
    state,
    commands: {
      selectFile,
      start,
      retry,
    },
  };
}
