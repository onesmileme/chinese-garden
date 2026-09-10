import type { AdminOperationsPort, AdminRole } from "@cc/api-client";
import { Plus, RefreshCw } from "lucide-react";
import { hasAdminRole } from "../authorization";
import { ContentEditor } from "../components/ContentEditor";
import { ContentFilters } from "../components/ContentFilters";
import { ContentTable } from "../components/ContentTable";
import { useContentLibrary } from "../use-content-library";

interface ContentLibraryPageProps {
  port: AdminOperationsPort;
  roles: readonly AdminRole[];
}

export function ContentLibraryPage({
  port,
  roles,
}: ContentLibraryPageProps) {
  const { state, commands } = useContentLibrary(port);
  const canEdit = hasAdminRole(roles, "EDITOR");
  const canReview = hasAdminRole(roles, "REVIEWER");

  const activate = () => {
    if (globalThis.confirm(`确认激活 ${state.form?.id}？`)) {
      void commands.activate();
    }
  };
  const archive = () => {
    if (globalThis.confirm(`确认归档 ${state.form?.id}？`)) {
      void commands.archive();
    }
  };

  return (
    <section className="content-page" aria-labelledby="content-page-title">
      <header className="page-header">
        <div>
          <p className="page-kicker">内容运营</p>
          <h1 id="content-page-title">内容库</h1>
        </div>
        {canEdit ? (
          <button
            aria-label="新建内容"
            className="primary-action"
            onClick={commands.startCreate}
            title="新建内容"
            type="button"
          >
            <Plus aria-hidden="true" size={17} />
            新建
          </button>
        ) : null}
      </header>

      <ContentFilters
        filters={state.filters}
        onFilterChange={commands.setFilter}
        onTypeChange={commands.selectType}
        type={state.type}
      />

      <div className={state.form === null ? "content-workspace" : "content-workspace editor-open"}>
        <div className="content-list">
          {state.listStatus === "loading" ? (
            <div className="inline-state" role="status">
              正在加载内容…
            </div>
          ) : null}
          {state.listStatus === "error" ? (
            <div className="inline-state inline-error" role="alert">
              <span>{state.message}</span>
              <button
                aria-label="重试加载内容"
                className="secondary-action"
                onClick={commands.retry}
                title="重试加载内容"
                type="button"
              >
                <RefreshCw aria-hidden="true" size={16} />
                重试
              </button>
            </div>
          ) : null}
          {state.listStatus === "ready" && state.items.length === 0 ? (
            <div className="inline-state">没有符合条件的内容</div>
          ) : null}
          {state.listStatus === "ready" && state.items.length > 0 ? (
            <ContentTable
              canEdit={canEdit}
              items={state.items}
              onEdit={commands.edit}
            />
          ) : null}
          {state.listStatus === "ready" && state.nextCursor !== null ? (
            <div className="pagination-row">
              {state.loadMoreError ? (
                <div className="inline-state inline-error" role="alert">
                  <span>{state.message}</span>
                  <button
                    aria-label="重试加载下一页内容"
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

        {state.form === null ? null : (
          <ContentEditor
            actualRevision={state.actualRevision}
            canEdit={canEdit}
            canReview={canReview}
            commandStatus={state.commandStatus}
            fieldIssues={state.fieldIssues}
            form={state.form}
            notice={state.notice}
            onActivate={activate}
            onArchive={archive}
            onChange={commands.updateForm}
            onClose={commands.closeEditor}
            onSave={() => void commands.save()}
            onValidate={() => void commands.validate()}
          />
        )}
      </div>
    </section>
  );
}
