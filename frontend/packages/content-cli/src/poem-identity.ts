import { createHash } from "node:crypto";
import { POEM_IDENTITY_ASSIGNED_RANGES } from "./poem-identity-unicode-15";

export const POEM_IDENTITY_UNICODE_VERSION = "15.0.0";

export const POEM_IDENTITY_WHITE_SPACE_RANGES = Object.freeze(
  "0009-000D 0020 0085 00A0 1680 2000-200A 2028-2029 202F 205F 3000".split(
    " ",
  ),
);

export const POEM_IDENTITY_PUNCTUATION_RANGES = Object.freeze(
  "0021-0023 0025-002A 002C-002F 003A-003B 003F-0040 005B-005D 005F 007B 007D 00A1 00A7 00AB 00B6-00B7 00BB 00BF 037E 0387 055A-055F 0589-058A 05BE 05C0 05C3 05C6 05F3-05F4 0609-060A 060C-060D 061B 061D-061F 066A-066D 06D4 0700-070D 07F7-07F9 0830-083E 085E 0964-0965 0970 09FD 0A76 0AF0 0C77 0C84 0DF4 0E4F 0E5A-0E5B 0F04-0F12 0F14 0F3A-0F3D 0F85 0FD0-0FD4 0FD9-0FDA 104A-104F 10FB 1360-1368 1400 166E 169B-169C 16EB-16ED 1735-1736 17D4-17D6 17D8-17DA 1800-180A 1944-1945 1A1E-1A1F 1AA0-1AA6 1AA8-1AAD 1B5A-1B60 1B7D-1B7E 1BFC-1BFF 1C3B-1C3F 1C7E-1C7F 1CC0-1CC7 1CD3 2010-2027 2030-2043 2045-2051 2053-205E 207D-207E 208D-208E 2308-230B 2329-232A 2768-2775 27C5-27C6 27E6-27EF 2983-2998 29D8-29DB 29FC-29FD 2CF9-2CFC 2CFE-2CFF 2D70 2E00-2E2E 2E30-2E4F 2E52-2E5D 3001-3003 3008-3011 3014-301F 3030 303D 30A0 30FB A4FE-A4FF A60D-A60F A673 A67E A6F2-A6F7 A874-A877 A8CE-A8CF A8F8-A8FA A8FC A92E-A92F A95F A9C1-A9CD A9DE-A9DF AA5C-AA5F AADE-AADF AAF0-AAF1 ABEB FD3E-FD3F FE10-FE19 FE30-FE52 FE54-FE61 FE63 FE68 FE6A-FE6B FF01-FF03 FF05-FF0A FF0C-FF0F FF1A-FF1B FF1F-FF20 FF3B-FF3D FF3F FF5B FF5D FF5F-FF65 10100-10102 1039F 103D0 1056F 10857 1091F 1093F 10A50-10A58 10A7F 10AF0-10AF6 10B39-10B3F 10B99-10B9C 10EAD 10F55-10F59 10F86-10F89 11047-1104D 110BB-110BC 110BE-110C1 11140-11143 11174-11175 111C5-111C8 111CD 111DB 111DD-111DF 11238-1123D 112A9 1144B-1144F 1145A-1145B 1145D 114C6 115C1-115D7 11641-11643 11660-1166C 116B9 1173C-1173E 1183B 11944-11946 119E2 11A3F-11A46 11A9A-11A9C 11A9E-11AA2 11B00-11B09 11C41-11C45 11C70-11C71 11EF7-11EF8 11F43-11F4F 11FFF 12470-12474 12FF1-12FF2 16A6E-16A6F 16AF5 16B37-16B3B 16B44 16E97-16E9A 16FE2 1BC9F 1DA87-1DA8B 1E95E-1E95F".split(
    " ",
  ),
);

type CodePointRange = readonly [number, number];

function parseCodePointRanges(ranges: readonly string[]): CodePointRange[] {
  return ranges.map((range) => {
    const [start, end = start] = range.split("-") as [string, string?];
    return [Number.parseInt(start, 16), Number.parseInt(end, 16)] as const;
  });
}

const UNICODE_15_ASSIGNED_RANGES = parseCodePointRanges(
  POEM_IDENTITY_ASSIGNED_RANGES,
);

const IGNORED_POEM_CODE_POINT_RANGES = parseCodePointRanges([
  ...POEM_IDENTITY_WHITE_SPACE_RANGES,
  ...POEM_IDENTITY_PUNCTUATION_RANGES,
])
  .sort(([left], [right]) => left - right);

function containsCodePoint(
  ranges: readonly CodePointRange[],
  codePoint: number,
): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const [start, end] = ranges[middle]!;
    if (codePoint < start) {
      high = middle - 1;
    } else if (codePoint > end) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

function normalizeWithUnicode15(value: string): string {
  let result = "";
  let assignedSegment = "";

  // A Unicode 15 unassigned code point is a CCC=0 boundary in the pinned model.
  for (const character of value) {
    if (
      containsCodePoint(
        UNICODE_15_ASSIGNED_RANGES,
        character.codePointAt(0)!,
      )
    ) {
      assignedSegment += character;
    } else {
      result += assignedSegment.normalize("NFKC");
      assignedSegment = "";
      result += character;
    }
  }

  return result + assignedSegment.normalize("NFKC");
}

export function normalizePoemText(value: string): string {
  return Array.from(normalizeWithUnicode15(value))
    .filter(
      (character) =>
        !containsCodePoint(
          IGNORED_POEM_CODE_POINT_RANGES,
          character.codePointAt(0)!,
        ),
    )
    .join("");
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
