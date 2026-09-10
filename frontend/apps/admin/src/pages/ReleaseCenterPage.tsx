import type {
  AdminOperationsPort,
  AdminRole,
  ReleaseStatus,
} from "@cc/api-client";
import { RefreshCw } from "lucide-react";
import { hasAdminRole } from "../authorization";
import { ArtifactRegistrationForm } from "../components/ArtifactRegistrationForm";
import { CreateReleaseForm } from "../components/CreateReleaseForm";
import { nextReleaseStatus } from "../release-form";
import { useReleases } from "../use-releases";
import "../release-center.css";

interface ReleaseCenterPageProps {
  port: AdminOperationsPort;
  roles: readonly AdminRole[];
}

const STATUSES: ReleaseStatus[] = [
  "DRAFT",
  "VALIDATED",
  "PUBLISHED",
  "RETIRED",
];

export function ReleaseCenterPage({
  port,
  roles,
}: ReleaseCenterPageProps) {
  const { state, commands } = useReleases(port);
  const canPublish = hasAdminRole(roles, "PUBLISHER");
  const nextStatus =
    state.detail === null ? null : nextReleaseStatus(state.detail.status);

  const transition = () => {
    if (
      state.detail !== null &&
      nextStatus !== null &&
      globalThis.confirm(
        `确认将 ${state.detail.version} 推进到 ${nextStatus}？`,
      )
    ) {
      void commands.transitionRelease();
    }
  };

  return (
    <section className="release-center" aria-labelledby="release-center-title">
      <header className="page-header">
        <div>
          <p className="page-kicker">内容发布</p>
          <h1 id="release-center-title">发布中心</h1>
        </div>
      </header>

      {canPublish ? (
        <CreateReleaseForm
          busy={state.mutationStatus === "creating"}
          form={state.createForm}
          onChange={commands.updateCreateForm}
          onSubmit={() => void commands.createRelease()}
        />
      ) : null}
      {state.notice === null ? null : (
        <p
          className={`release-notice release-notice-${state.noticeKind}`}
          role={state.noticeKind === "error" ? "alert" : "status"}
        >
          {state.notice}
        </p>
      )}

      <div className="release-toolbar">
        <label>
          <span>发布状态</span>
          <select
            onChange={(event) =>
              commands.setStatusFilter(
                event.currentTarget.value as ReleaseStatus | "",
              )
            }
            value={state.statusFilter}
          >
            <option value="">全部状态</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="release-workspace">
        <div className="release-list">
          {state.listStatus === "loading" ? (
            <div className="inline-state" role="status">
              正在加载发布记录…
            </div>
          ) : null}
          {state.listStatus === "error" ? (
            <div className="inline-state inline-error" role="alert">
              <span>{state.message}</span>
              <button
                aria-label="重试加载发布记录"
                className="secondary-action"
                onClick={commands.retryList}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={16} />
                重试
              </button>
            </div>
          ) : null}
          {state.listStatus === "ready" && state.items.length === 0 ? (
            <div className="inline-state">没有符合条件的发布记录</div>
          ) : null}
          {state.listStatus === "ready" && state.items.length > 0 ? (
            <div className="table-scroll">
              <table className="release-table">
                <thead>
                  <tr>
                    <th>版本</th>
                    <th>状态</th>
                    <th>制品</th>
                    <th>最低客户端</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {state.items.map((release) => (
                    <tr key={release.version}>
                      <td className="release-version">{release.version}</td>
                      <td>{release.status}</td>
                      <td>{release.artifactCount}/5</td>
                      <td>{release.minClientVersion}</td>
                      <td>{release.createdAt}</td>
                      <td>
                        <button
                          className="secondary-action"
                          onClick={() =>
                            void commands.selectRelease(release.version)
                          }
                          type="button"
                        >
                          查看 {release.version}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {state.listStatus === "ready" && state.nextCursor !== null ? (
            <div className="pagination-row">
              {state.loadMoreError ? (
                <div className="inline-state inline-error" role="alert">
                  <span>{state.message}</span>
                  <button
                    aria-label="重试加载下一页发布记录"
                    className="secondary-action"
                    onClick={() => void commands.loadNext()}
                    type="button"
                  >
                    重试
                  </button>
                </div>
              ) : (
                <button
                  className="secondary-action"
                  disabled={state.loadingMore}
                  onClick={() => void commands.loadNext()}
                  type="button"
                >
                  {state.loadingMore ? "正在加载…" : "下一页"}
                </button>
              )}
            </div>
          ) : null}
        </div>

        {state.detailStatus === "loading" ? (
          <aside className="release-detail" role="status">
            正在加载发布详情…
          </aside>
        ) : null}
        {state.detailStatus === "error" ? (
          <aside className="release-detail" role="alert">
            无法加载发布详情，请重试
          </aside>
        ) : null}
        {state.detail === null ? null : (
          <aside
            className="release-detail"
            aria-labelledby="release-detail-title"
          >
            <h2 id="release-detail-title">{state.detail.version} 详情</h2>
            <dl>
              <dt>状态</dt>
              <dd>{state.detail.status}</dd>
              <dt>掌握规则</dt>
              <dd>{state.detail.masteryRuleVersion}</dd>
              <dt>晋级规则</dt>
              <dd>{state.detail.progressionRuleVersion}</dd>
              <dt>等级规则</dt>
              <dd>{state.detail.contentLevelRuleVersion}</dd>
              <dt>最低客户端</dt>
              <dd>{state.detail.minClientVersion}</dd>
            </dl>
            <p>快照内容：{state.detail.items.length} 项</p>
            {state.detail.items.length === 0 ? null : (
              <ul className="release-detail-list">
                {state.detail.items.map((item) => (
                  <li key={item.id}>
                    <span>{item.id}</span>
                    <span>{item.type} · {item.level}</span>
                    <span>修订 {item.revision}</span>
                  </li>
                ))}
              </ul>
            )}
            <p>已登记制品：{state.detail.artifacts.length}/5</p>
            {state.detail.artifacts.length === 0 ? null : (
              <ul className="release-detail-list">
                {state.detail.artifacts.map((artifact) => (
                  <li key={artifact.level}>
                    <strong>{artifact.level}</strong>
                    <a href={artifact.artifactUrl}>{artifact.artifactUrl}</a>
                    <span>
                      {artifact.fileSize} bytes · {artifact.format}
                    </span>
                    <code>{artifact.sha256}</code>
                  </li>
                ))}
              </ul>
            )}
            {!canPublish || nextStatus === null ? null : (
              <button
                className="primary-action"
                disabled={state.mutationStatus === "transitioning"}
                onClick={transition}
                type="button"
              >
                {state.mutationStatus === "transitioning"
                  ? "正在推进…"
                  : `推进到 ${nextStatus}`}
              </button>
            )}
            {canPublish && state.detail.status === "DRAFT" ? (
              <ArtifactRegistrationForm
                busy={state.mutationStatus === "registering"}
                onChange={commands.updateArtifactRow}
                onSubmit={() => void commands.registerArtifacts()}
                rows={state.artifactRows}
              />
            ) : null}
          </aside>
        )}
      </div>
    </section>
  );
}
