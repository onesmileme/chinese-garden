import { createHash } from "node:crypto";

const IGNORED_POEM_CODE_POINTS = /[\p{White_Space}\p{P}]/gu;

export function normalizePoemText(value: string): string {
  return value.normalize("NFKC").replace(IGNORED_POEM_CODE_POINTS, "");
}

export function poemIdentity(
  author: string,
  lines: readonly string[],
): string {
  return `${normalizePoemText(author)}\u0000${normalizePoemText(lines.join(""))}`;
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(Reflect.get(value, key))]),
    );
  }
  return value;
}

export function canonicalJsonSha256(value: unknown): string {
  return sha256Text(JSON.stringify(canonicalize(value)));
}
