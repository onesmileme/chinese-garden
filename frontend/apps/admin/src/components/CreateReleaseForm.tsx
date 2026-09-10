import type { FormEvent } from "react";
import type { CreateReleaseFormData } from "../release-form";

interface CreateReleaseFormProps {
  form: CreateReleaseFormData;
  busy: boolean;
  onChange: (form: CreateReleaseFormData) => void;
  onSubmit: () => void;
}

const FIELDS: Array<{
  name: keyof CreateReleaseFormData;
  label: string;
  placeholder: string;
}> = [
  { name: "version", label: "发布版本", placeholder: "corpus-v9" },
  {
    name: "masteryRuleVersion",
    label: "掌握规则版本",
    placeholder: "mastery-v3",
  },
  {
    name: "progressionRuleVersion",
    label: "晋级规则版本",
    placeholder: "progression-v2",
  },
  {
    name: "contentLevelRuleVersion",
    label: "内容等级规则版本",
    placeholder: "level-v4",
  },
  {
    name: "minClientVersion",
    label: "最低客户端版本",
    placeholder: "2.9.0",
  },
];

export function CreateReleaseForm({
  form,
  busy,
  onChange,
  onSubmit,
}: CreateReleaseFormProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="release-create-form" onSubmit={submit}>
      <div>
        <p className="page-kicker">不可变快照</p>
        <h2>创建发布快照</h2>
      </div>
      <div className="release-form-grid">
        {FIELDS.map((field) => (
          <label key={field.name}>
            <span>{field.label}</span>
            <input
              disabled={busy}
              onChange={(event) =>
                onChange({
                  ...form,
                  [field.name]: event.currentTarget.value,
                })
              }
              placeholder={field.placeholder}
              value={form[field.name]}
            />
          </label>
        ))}
      </div>
      <button
        className="primary-action"
        disabled={busy}
        type="submit"
      >
        {busy ? "正在创建…" : "创建发布快照"}
      </button>
    </form>
  );
}
