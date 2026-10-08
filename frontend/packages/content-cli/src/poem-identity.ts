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

type CanonicalJsonValue =
  | null
  | boolean
  | string
  | number
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

function invalidJson(path: string, detail: string): never {
  throw new TypeError(
    `canonicalJsonSha256 only accepts valid JSON values; ${detail} at ${path}`,
  );
}

function withAncestor<T>(
  value: object,
  path: string,
  ancestors: Set<object>,
  build: () => T,
): T {
  if (ancestors.has(value)) {
    invalidJson(path, "received circular reference");
  }

  ancestors.add(value);
  try {
    return build();
  } finally {
    ancestors.delete(value);
  }
}

function canonicalizeArray(
  value: unknown[],
  path: string,
  ancestors: Set<object>,
): CanonicalJsonValue[] {
  return withAncestor(value, path, ancestors, () => {
    const canonical: CanonicalJsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        invalidJson(path, "received sparse array");
      }
      canonical.push(canonicalize(value[index], `${path}[${index}]`, ancestors));
    }
    if (Reflect.ownKeys(value).length !== value.length + 1) {
      invalidJson(path, "received array with non-index properties");
    }
    return canonical;
  });
}

function canonicalizeObject(
  value: object,
  path: string,
  ancestors: Set<object>,
): { [key: string]: CanonicalJsonValue } {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalidJson(path, "received non-plain object");
  }

  return withAncestor(value, path, ancestors, () => {
    const entries: Array<[string, CanonicalJsonValue]> = [];
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (typeof key !== "string") {
        invalidJson(path, "received symbol-keyed property");
      }
    }

    for (const key of (keys as string[]).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable || !("value" in descriptor)) {
        invalidJson(`${path}.${key}`, "received non-JSON property");
      }
      entries.push([
        key,
        canonicalize(descriptor.value, `${path}.${key}`, ancestors),
      ]);
    }
    return Object.fromEntries(entries);
  });
}

function canonicalize(
  value: unknown,
  path = "$",
  ancestors = new Set<object>(),
): CanonicalJsonValue {
  if (value === null) return null;

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      invalidJson(path, "received non-finite number");
    }
    return value;
  }
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return canonicalizeArray(value, path, ancestors);
    }
    return canonicalizeObject(value, path, ancestors);
  }

  return invalidJson(path, `received ${typeof value}`);
}

export function canonicalJsonSha256(value: unknown): string {
  return sha256Text(
    JSON.stringify(canonicalize(value)) as string,
  );
}
