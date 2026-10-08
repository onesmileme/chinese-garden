import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  POEM_IDENTITY_PUNCTUATION_RANGES,
  POEM_IDENTITY_UNICODE_VERSION,
  POEM_IDENTITY_WHITE_SPACE_RANGES,
  canonicalJsonSha256,
  normalizePoemText,
  poemIdentity,
  sha256Text,
} from "../src/poem-identity";
import { POEM_IDENTITY_ASSIGNED_RANGES } from "../src/poem-identity-unicode-15";

const contract = JSON.parse(
  readFileSync(
    new URL("../../../content/test-vectors/poem-identity-v1.json", import.meta.url),
    "utf8",
  ),
) as {
  ruleVersion: string;
  unicodeVersion: string;
  assignedSource: {
    file: string;
    sha256: string;
    property: string;
  };
  assignedRanges: string[];
  whiteSpaceRanges: string[];
  punctuationRanges: string[];
  vectors: Array<{
    name: string;
    author: string;
    lines: string[];
    normalizedAuthor: string;
    normalizedBody: string;
    identity: string;
  }>;
};

function countCodePoints(ranges: readonly string[]): number {
  return ranges.reduce((total, range) => {
    const [start, end = start] = range.split("-");
    return total + Number.parseInt(end, 16) - Number.parseInt(start, 16) + 1;
  }, 0);
}

const cyclicValue: Record<string, unknown> = {};
cyclicValue.self = cyclicValue;

const symbolKeyedValue = { visible: true };
Object.defineProperty(symbolKeyedValue, Symbol("hidden"), { value: true });

const nonEnumerableValue = {};
Object.defineProperty(nonEnumerableValue, "hidden", { value: true });

const accessorValue = {};
Object.defineProperty(accessorValue, "computed", {
  enumerable: true,
  get: () => true,
});

const arrayWithProperty: unknown[] = [];
Object.assign(arrayWithProperty, { extra: true });

describe("poem identity", () => {
  it("pins the production Unicode tables to the shared Unicode 15 contract", () => {
    expect(contract.ruleVersion).toBe("poem-identity-v1");
    expect(contract.unicodeVersion).toBe("15.0.0");
    expect(contract.assignedSource).toEqual({
      file: "https://www.unicode.org/Public/15.0.0/ucd/extracted/DerivedGeneralCategory.txt",
      sha256:
        "fe29a45c0882500e591140aaa5c4f5067e6a5d746806148af34400c48b9c06f9",
      property: "General_Category != Cn",
    });
    expect(contract.assignedRanges).toHaveLength(707);
    expect(countCodePoints(contract.assignedRanges)).toBe(288_767);
    expect(contract.whiteSpaceRanges).toHaveLength(10);
    expect(countCodePoints(contract.whiteSpaceRanges)).toBe(25);
    expect(contract.punctuationRanges).toHaveLength(191);
    expect(countCodePoints(contract.punctuationRanges)).toBe(842);
    expect(POEM_IDENTITY_UNICODE_VERSION).toBe(contract.unicodeVersion);
    expect(POEM_IDENTITY_ASSIGNED_RANGES).toEqual(contract.assignedRanges);
    expect(POEM_IDENTITY_WHITE_SPACE_RANGES).toEqual(
      contract.whiteSpaceRanges,
    );
    expect(POEM_IDENTITY_PUNCTUATION_RANGES).toEqual(
      contract.punctuationRanges,
    );
  });

  it.each(contract.vectors)("matches $name", (vector) => {
    expect(normalizePoemText(vector.author)).toBe(vector.normalizedAuthor);
    expect(normalizePoemText(vector.lines.join(""))).toBe(vector.normalizedBody);
    expect(poemIdentity(vector.author, vector.lines)).toBe(vector.identity);
  });

  it("hashes canonical objects to a fixed digest independent of key order", () => {
    const expected =
      "b90ecf34c980b7ce791e11520e8f83c0c20ddbc78be1ff95bd85fb7708edb05a";

    expect(canonicalJsonSha256({ b: 2, a: [1, { d: 4, c: 3 }] })).toBe(
      expected,
    );
    expect(canonicalJsonSha256({ a: [1, { c: 3, d: 4 }], b: 2 })).toBe(
      expected,
    );
  });

  it("preserves array order and values", () => {
    expect(canonicalJsonSha256([1, 2, 3])).toBe(
      "a615eeaee21de5179de080de8c3052c8da901138406ba71c38c032845f7d54f4",
    );
    expect(canonicalJsonSha256([3, 2, 1])).toBe(
      "30c8681f9b840aceee56b737f3b126ae67ec4eb71d2881db831f86014fba016d",
    );
    expect(canonicalJsonSha256([1, 2, 4])).toBe(
      "33a1c10fd7cb2b79058ab93874877d6234886e4a8a123d9f2a2c9277f6f2efc5",
    );
  });

  it.each([
    ["null", null, "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b"],
    ["true", true, "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b"],
    ["false", false, "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa"],
    ["number", 42, "73475cb40a568e8da8a045ced110137e159f890ac4da883b6b17dc651b3a8049"],
    ["string", "诗", "60e8f2a42b91823927f58d0873755124415146f4dcb560b15e3dce2c97c21758"],
  ])("hashes the %s JSON primitive", (_name, value, expected) => {
    expect(canonicalJsonSha256(value)).toBe(expected);
  });

  it("accepts plain objects with a null prototype", () => {
    const value = Object.assign(Object.create(null) as Record<string, unknown>, {
      answer: 42,
    });

    expect(canonicalJsonSha256(value)).toBe(
      canonicalJsonSha256({ answer: 42 }),
    );
  });

  it.each([
    ["undefined", undefined, "received undefined at $"],
    ["BigInt", 1n, "received bigint at $"],
    ["NaN", Number.NaN, "received non-finite number at $"],
    ["Infinity", Number.POSITIVE_INFINITY, "received non-finite number at $"],
    ["negative Infinity", Number.NEGATIVE_INFINITY, "received non-finite number at $"],
    ["Date", new Date(0), "received non-plain object at $"],
    ["boxed number", new Number(1), "received non-plain object at $"],
    ["boxed boolean", new Boolean(true), "received non-plain object at $"],
    ["boxed string", new String("value"), "received non-plain object at $"],
    ["symbol", Symbol("value"), "received symbol at $"],
    ["function", () => true, "received function at $"],
    ["nested undefined", { child: [undefined] }, "received undefined at $.child[0]"],
    ["class instance", new (class Example {})(), "received non-plain object at $"],
    ["sparse array", Array(1), "received sparse array at $"],
    ["array property", arrayWithProperty, "received array with non-index properties at $"],
    ["symbol-keyed property", symbolKeyedValue, "received symbol-keyed property at $"],
    ["non-enumerable property", nonEnumerableValue, "received non-JSON property at $.hidden"],
    ["accessor property", accessorValue, "received non-JSON property at $.computed"],
    ["circular reference", cyclicValue, "received circular reference at $.self"],
  ])("rejects %s", (_name, value, detail) => {
    expect(() => canonicalJsonSha256(value)).toThrowError(
      new TypeError(
        `canonicalJsonSha256 only accepts valid JSON values; ${detail}`,
      ),
    );
  });

  it("hashes text as UTF-8 SHA-256", () => {
    expect(sha256Text("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
