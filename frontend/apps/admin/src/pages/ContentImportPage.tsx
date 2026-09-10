import type { AdminOperationsPort } from "@cc/api-client";
import { type ChangeEvent, useState } from "react";
import { useContentImport } from "../use-content-import";
import "../content-import.css";

interface ContentImportPageProps {
  port: AdminOperationsPort;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ContentImportPage({ port }: ContentImportPageProps) {
  const { state, commands } = useContentImport(port);
  const [readError, setReadError] = useState<string | null>(null);
  const processed =
    state.checkpoint === null
      ? 0
      : Math.min(
          state.checkpoint.nextChunkIndex * 1000,
          state.candidateCount,
        );

  async function selectFile(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.currentTarget.files?.[0];
    if (file === undefined) return;
    setReadError(null);
    try {
      const source = await file.text();
      commands.selectFile(
        { name: file.name, size: file.size },
        source,
      );
    } catch {
      setReadError("无法读取文件，请重试");
    }
  }

  return (
    <section
      aria-labelledby="content-import-title"
      className="content-import-page"
    >
      <header className="page-header">
        <div>
          <p className="page-kicker">内容运营</p>
          <h1 id="content-import-title">批量导入</h1>
        </div>
      </header>

      <div className="import-panel">
        <label className="import-file-field">
          <span>NDJSON 文件</span>
          <input
            accept=".ndjson,application/x-ndjson"
            disabled={state.status === "running"}
            onChange={(event) => void selectFile(event)}
            type="file"
          />
        </label>

        {state.file === null ? null : (
          <dl className="import-file-meta">
            <div>
              <dt>文件名</dt>
              <dd>{state.file.name}</dd>
            </div>
            <div>
              <dt>大小</dt>
              <dd>{formatBytes(state.file.size)}</dd>
            </div>
            <div>
              <dt>候选数</dt>
              <dd>{state.candidateCount}</dd>
            </div>
          </dl>
        )}

        {readError === null ? null : (
          <p className="import-error" role="alert">
            {readError}
          </p>
        )}

        {state.status === "invalid" || state.status === "failed" ? (
          <p className="import-error" role="alert">
            {state.message}
          </p>
        ) : null}

        {state.status === "running" ? (
          <p className="import-status" role="status">
            正在导入 {processed} / {state.candidateCount}
          </p>
        ) : null}

        {state.checkpoint === null ? null : (
          <div className="import-progress">
            <progress
              aria-label="导入进度"
              max={state.candidateCount}
              value={processed}
            />
            <span>
              {processed} / {state.candidateCount}
            </span>
            <p>
              批次 ID <strong>{state.checkpoint.batchId}</strong>
            </p>
            <ul aria-label="导入统计">
              <li>已导入 {state.checkpoint.imported}</li>
              <li>已跳过 {state.checkpoint.skipped}</li>
              <li>已拒绝 {state.checkpoint.rejected}</li>
            </ul>
          </div>
        )}

        {state.status === "completed" ? (
          <p className="import-success">{state.message}</p>
        ) : null}

        {state.status === "failed" ? (
          <button
            className="primary-action"
            onClick={() => void commands.retry()}
            type="button"
          >
            继续导入
          </button>
        ) : (
          <button
            className="primary-action"
            disabled={state.status !== "ready"}
            onClick={() => void commands.start()}
            type="button"
          >
            开始导入
          </button>
        )}
      </div>
    </section>
  );
}
