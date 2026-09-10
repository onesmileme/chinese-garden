import type { ContentLevelValue } from "@cc/api-client";
import type { FormEvent } from "react";
import type { ArtifactFormRow } from "../release-form";

interface ArtifactRegistrationFormProps {
  rows: ArtifactFormRow[];
  busy: boolean;
  onChange: (
    level: ContentLevelValue,
    fields: Partial<Omit<ArtifactFormRow, "level">>,
  ) => void;
  onSubmit: () => void;
}

export function ArtifactRegistrationForm({
  rows,
  busy,
  onChange,
  onSubmit,
}: ArtifactRegistrationFormProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="artifact-form" onSubmit={submit}>
      <header>
        <p className="page-kicker">运行时产物</p>
        <h3>登记 L1-L5 制品</h3>
      </header>
      <div className="artifact-rows">
        {rows.map((row) => (
          <fieldset key={row.level}>
            <legend>L{row.level}</legend>
            <label>
              <span>L{row.level} HTTPS URL</span>
              <input
                disabled={busy}
                inputMode="url"
                onChange={(event) =>
                  onChange(row.level, {
                    artifactUrl: event.currentTarget.value,
                  })
                }
                placeholder={`https://cdn.example/L${row.level}.tar.gz`}
                value={row.artifactUrl}
              />
            </label>
            <label>
              <span>L{row.level} SHA-256</span>
              <input
                disabled={busy}
                maxLength={64}
                onChange={(event) =>
                  onChange(row.level, { sha256: event.currentTarget.value })
                }
                value={row.sha256}
              />
            </label>
            <label>
              <span>L{row.level} 文件大小</span>
              <input
                disabled={busy}
                inputMode="numeric"
                min="1"
                onChange={(event) =>
                  onChange(row.level, { fileSize: event.currentTarget.value })
                }
                type="number"
                value={row.fileSize}
              />
            </label>
            <div className="artifact-format">
              <span>格式</span>
              <strong>tar+gzip</strong>
            </div>
          </fieldset>
        ))}
      </div>
      <button
        className="primary-action"
        disabled={busy}
        type="submit"
      >
        {busy ? "正在登记…" : "登记五级制品"}
      </button>
    </form>
  );
}
