import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonSha256,
  normalizePoemText,
  poemIdentity,
  sha256Text,
} from "../src/poem-identity";

const vectors = JSON.parse(
  readFileSync(
    new URL("../../../content/test-vectors/poem-identity-v1.json", import.meta.url),
    "utf8",
  ),
) as {
  vectors: Array<{
    name: string;
    author: string;
    lines: string[];
    normalizedAuthor: string;
    normalizedBody: string;
    identity: string;
  }>;
};

describe("poem identity", () => {
  it.each(vectors.vectors)("matches $name", (vector) => {
    expect(normalizePoemText(vector.author)).toBe(vector.normalizedAuthor);
    expect(normalizePoemText(vector.lines.join(""))).toBe(vector.normalizedBody);
    expect(poemIdentity(vector.author, vector.lines)).toBe(vector.identity);
  });

  it("hashes canonical objects independently of key insertion order", () => {
    expect(canonicalJsonSha256({ b: 2, a: [1, { d: 4, c: 3 }] })).toBe(
      canonicalJsonSha256({ a: [1, { c: 3, d: 4 }], b: 2 }),
    );
    expect(sha256Text("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
