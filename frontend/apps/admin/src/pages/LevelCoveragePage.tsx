import type {
  AdminOperationsPort,
  LevelCoverage,
} from "@cc/api-client";
import {
  CheckCircle2,
  CircleAlert,
  RefreshCw,
} from "lucide-react";
import { useLevelCoverage } from "../use-level-coverage";
import "../level-coverage.css";

interface LevelCoveragePageProps {
  port: AdminOperationsPort;
}

function CoverageStatus({ row }: { row: LevelCoverage }) {
  if (row.blockingIssues.length === 0) {
    return (
      <span
        aria-label={`${row.level} 可发布`}
        className="coverage-status coverage-status-ready"
        role="status"
      >
        <CheckCircle2 aria-hidden="true" size={16} />
        可发布
      </span>
    );
  }

  return (
    <div className="coverage-blockers">
      <span
        aria-label={`${row.level} 发布阻塞`}
        className="coverage-status coverage-status-blocked"
        role="status"
      >
        <CircleAlert aria-hidden="true" size={16} />
        发布阻塞
      </span>
      <details className="coverage-issues">
        <summary>查看 {row.blockingIssues.length} 个阻塞项</summary>
        <ul>
          {row.blockingIssues.map((issue) => (
            <li key={issue}>
              <code>{issue}</code>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function LevelCoveragePage({ port }: LevelCoveragePageProps) {
  const { state, commands } = useLevelCoverage(port);

  return (
    <section
      aria-labelledby="level-coverage-title"
      className="level-coverage-page"
    >
      <header className="page-header">
        <div>
          <p className="page-kicker">内容质量</p>
          <h1 id="level-coverage-title">等级覆盖</h1>
        </div>
      </header>

      {state.status === "loading" ? (
        <div className="coverage-state" role="status">
          正在加载等级覆盖…
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="coverage-state coverage-error" role="alert">
          <span>{state.message}</span>
          <button
            aria-label="重试加载等级覆盖"
            className="secondary-action"
            onClick={commands.retry}
            title="重试加载等级覆盖"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} />
            重试
          </button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <div className="coverage-table-wrap">
          <table
            aria-label="L1-L5 等级覆盖"
            className="coverage-table"
          >
            <thead>
              <tr>
                <th scope="col">等级</th>
                <th scope="col">汉字</th>
                <th scope="col">古诗词</th>
                <th scope="col">可接龙成语</th>
                <th scope="col">状态</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.level}>
                  <th scope="row">{row.level}</th>
                  <td>{row.characters}</td>
                  <td>{row.poems}</td>
                  <td>{row.chainableIdioms}</td>
                  <td>
                    <CoverageStatus row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
