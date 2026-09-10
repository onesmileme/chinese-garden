import { Archive, CheckCircle, Save, ShieldCheck, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import type { ContentForm } from "../content-form";

type CommandStatus =
  | "idle"
  | "saving"
  | "validating"
  | "activating"
  | "archiving";

interface ContentEditorProps {
  form: ContentForm;
  canEdit: boolean;
  canReview: boolean;
  fieldIssues: Record<string, string[]>;
  actualRevision: number | null;
  commandStatus: CommandStatus;
  notice: string | null;
  onChange: (form: ContentForm) => void;
  onSave: () => void;
  onValidate: () => void;
  onActivate: () => void;
  onArchive: () => void;
  onClose: () => void;
}

interface FieldProps {
  children: ReactNode;
  label: string;
  path: string;
  issues: Record<string, string[]>;
}

function Field({ children, label, path, issues }: FieldProps) {
  const messages = issues[path] ?? [];
  return (
    <div className="editor-field">
      <label>
        <span>{label}</span>
        {children}
      </label>
      {messages.map((message, index) => (
        <p className="field-issue" key={`${path}-${index}`} role="alert">
          {message}
        </p>
      ))}
    </div>
  );
}

export function ContentEditor({
  form,
  canEdit,
  canReview,
  fieldIssues,
  actualRevision,
  commandStatus,
  notice,
  onChange,
  onSave,
  onValidate,
  onActivate,
  onArchive,
  onClose,
}: ContentEditorProps) {
  const busy = commandStatus !== "idle";
  const existing = form.expectedRevision !== null;
  const change = (fields: Partial<ContentForm>) => {
    onChange({ ...form, ...fields } as ContentForm);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };

  return (
    <aside className="content-editor" aria-labelledby="content-editor-title">
      <header className="editor-header">
        <div>
          <p className="page-kicker">{existing ? "编辑内容" : "新建内容"}</p>
          <h2 id="content-editor-title">
            {existing ? form.id : `新建 ${form.type}`}
          </h2>
        </div>
        <button
          aria-label="关闭编辑器"
          className="icon-button"
          onClick={onClose}
          title="关闭编辑器"
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </header>

      {notice === null ? null : (
        <p className="editor-notice" role="status">
          {notice}
        </p>
      )}
      {actualRevision === null ? null : (
        <p className="conflict-notice" role="alert">
          服务端当前修订：{actualRevision}
        </p>
      )}

      <form className="editor-form" onSubmit={submit}>
        <fieldset
          aria-label="内容详情字段"
          className="editor-fields"
          disabled={!canEdit}
        >
          <div className="editor-grid">
          <Field label="内容 ID" path="/id" issues={fieldIssues}>
            <input
              disabled={existing}
              onChange={(event) => change({ id: event.currentTarget.value })}
              value={form.id}
            />
          </Field>
          <Field label="等级" path="/level" issues={fieldIssues}>
            <select
              onChange={(event) =>
                change({ level: event.currentTarget.value as ContentForm["level"] })
              }
              value={form.level}
            >
              {["L1", "L2", "L3", "L4", "L5"].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </Field>
          <Field label="难度" path="/difficulty" issues={fieldIssues}>
            <select
              onChange={(event) =>
                change({
                  difficulty: event.currentTarget
                    .value as ContentForm["difficulty"],
                })
              }
              value={form.difficulty}
            >
              {["L1", "L2", "L3", "L4", "L5"].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </Field>
          <Field label="标签" path="/tags" issues={fieldIssues}>
            <input
              onChange={(event) =>
                change({ tagsText: event.currentTarget.value })
              }
              placeholder="逗号分隔"
              value={form.tagsText}
            />
          </Field>
          </div>

          <label className="checkbox-field">
            <input
              checked={form.promotionRequired}
              onChange={(event) =>
                change({ promotionRequired: event.currentTarget.checked })
              }
              type="checkbox"
            />
            <span>晋级必需</span>
          </label>

          {form.type === "CHARACTER" ? (
            <div className="editor-grid type-fields">
            <Field label="汉字" path="/payload/char" issues={fieldIssues}>
              <input
                onChange={(event) => change({ char: event.currentTarget.value })}
                value={form.char}
              />
            </Field>
            <Field label="拼音" path="/payload/pinyin" issues={fieldIssues}>
              <input
                onChange={(event) =>
                  change({ pinyin: event.currentTarget.value })
                }
                value={form.pinyin}
              />
            </Field>
            <Field label="图片 ID" path="/payload/imageId" issues={fieldIssues}>
              <input
                onChange={(event) =>
                  change({ imageId: event.currentTarget.value })
                }
                value={form.imageId}
              />
            </Field>
            <Field label="主题" path="/payload/theme" issues={fieldIssues}>
              <input
                onChange={(event) =>
                  change({ theme: event.currentTarget.value })
                }
                value={form.theme}
              />
            </Field>
            <Field label="笔画" path="/payload/strokes" issues={fieldIssues}>
              <input
                min="1"
                onChange={(event) =>
                  change({ strokes: Number(event.currentTarget.value) })
                }
                type="number"
                value={form.strokes}
              />
            </Field>
            </div>
          ) : null}

          {form.type === "POEM" ? (
            <div className="editor-grid type-fields">
            <Field label="标题" path="/payload/title" issues={fieldIssues}>
              <input
                onChange={(event) =>
                  change({ title: event.currentTarget.value })
                }
                value={form.title}
              />
            </Field>
            <Field label="作者" path="/payload/author" issues={fieldIssues}>
              <input
                onChange={(event) =>
                  change({ author: event.currentTarget.value })
                }
                value={form.author}
              />
            </Field>
            <Field
              label="诗句（每行一条）"
              path="/payload/lines"
              issues={fieldIssues}
            >
              <textarea
                onChange={(event) =>
                  change({ linesText: event.currentTarget.value })
                }
                rows={5}
                value={form.linesText}
              />
            </Field>
            <Field
              label="汉字引用（逗号或换行）"
              path="/payload/charRefs"
              issues={fieldIssues}
            >
              <textarea
                onChange={(event) =>
                  change({ charRefsText: event.currentTarget.value })
                }
                rows={5}
                value={form.charRefsText}
              />
            </Field>
            </div>
          ) : null}

          {form.type === "IDIOM" ? (
            <div className="editor-grid type-fields">
            <Field label="成语" path="/payload/text" issues={fieldIssues}>
              <input
                onChange={(event) => change({ text: event.currentTarget.value })}
                value={form.text}
              />
            </Field>
            <Field label="释义" path="/payload/meaning" issues={fieldIssues}>
              <textarea
                onChange={(event) =>
                  change({ meaning: event.currentTarget.value })
                }
                rows={4}
                value={form.meaning}
              />
            </Field>
            <Field
              label="首字拼音"
              path="/payload/headPinyin"
              issues={fieldIssues}
            >
              <input
                onChange={(event) =>
                  change({ headPinyin: event.currentTarget.value })
                }
                value={form.headPinyin}
              />
            </Field>
            <Field
              label="尾字拼音"
              path="/payload/tailPinyin"
              issues={fieldIssues}
            >
              <input
                onChange={(event) =>
                  change({ tailPinyin: event.currentTarget.value })
                }
                value={form.tailPinyin}
              />
            </Field>
            </div>
          ) : null}
        </fieldset>

        <div className="editor-actions">
          {canEdit ? (
            <button
              aria-label="保存内容"
              className="primary-action"
              disabled={busy}
              title="保存内容"
              type="submit"
            >
              <Save aria-hidden="true" size={17} />
              保存
            </button>
          ) : null}
          {existing && canReview ? (
            <>
              <button
                aria-label="校验内容"
                disabled={busy}
                onClick={onValidate}
                title="校验内容"
                type="button"
              >
                <ShieldCheck aria-hidden="true" size={17} />
                校验
              </button>
              <button
                aria-label="激活内容"
                disabled={busy}
                onClick={onActivate}
                title="激活内容"
                type="button"
              >
                <CheckCircle aria-hidden="true" size={17} />
                激活
              </button>
            </>
          ) : null}
          {existing && canEdit ? (
            <>
              <button
                aria-label="归档内容"
                className="danger-action"
                disabled={busy}
                onClick={onArchive}
                title="归档内容"
                type="button"
              >
                <Archive aria-hidden="true" size={17} />
                归档
              </button>
            </>
          ) : null}
        </div>
      </form>
    </aside>
  );
}
