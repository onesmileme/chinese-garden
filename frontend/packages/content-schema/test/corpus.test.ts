import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { characterSchema, idiomSchema, poemSchema } from "../src/question";

const corpusDir = fileURLToPath(
  new URL("../../../content/corpus/", import.meta.url),
);
const load = (rel: string) => JSON.parse(readFileSync(corpusDir + rel, "utf8"));

describe("corpus files parse against their schema", () => {
  it("every character is valid", () => {
    const { version, characters } = load("character-bank.json");
    expect(version).toBe("corpus-v5");
    expect(characters).toHaveLength(122);
    for (const c of characters) expect(characterSchema.parse(c).id).toBe(c.id);
  });
  it("every poem is valid", () => {
    const { version, poems } = load("poem-bank.json");
    expect(version).toBe("corpus-v5");
    expect(poems).toHaveLength(23);
    for (const p of poems) expect(poemSchema.parse(p).id).toBe(p.id);
  });
  it("every idiom is valid", () => {
    const { version, idioms } = load("idiom-bank.json");
    expect(version).toBe("corpus-v5");
    expect(idioms).toHaveLength(47);
    for (const idiom of idioms) {
      expect(idiomSchema.parse(idiom).id).toBe(idiom.id);
    }
  });
});

describe("corpus completes the L1-L5 gradient", () => {
  const countByLevel = (items: { level: number; status: string }[]) => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const item of items) {
      if (item.status === "ACTIVE") counts[item.level] += 1;
    }
    return counts;
  };

  it("has at least 12 ACTIVE characters at every level", () => {
    const { characters } = load("character-bank.json");
    const counts = countByLevel(characters);
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(counts[level]).toBeGreaterThanOrEqual(12);
    }
  });

  it("has at least 4 ACTIVE poems at every level", () => {
    const { poems } = load("poem-bank.json");
    const counts = countByLevel(poems);
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(counts[level]).toBeGreaterThanOrEqual(4);
    }
  });

  it("has at least 6 ACTIVE idioms at every level", () => {
    const { idioms } = load("idiom-bank.json");
    const counts = countByLevel(idioms);
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(counts[level]).toBeGreaterThanOrEqual(6);
    }
  });

  it("keeps a same-or-lower-level ACTIVE idiom successor for every idiom", () => {
    const { idioms } = load("idiom-bank.json");
    const active = idioms.filter(
      (i: { status: string }) => i.status === "ACTIVE",
    );
    for (const source of active) {
      const matching = active.filter(
        (c: { id: string; headPinyin: string }) =>
          c.id !== source.id && c.headPinyin === source.tailPinyin,
      );
      if (matching.length === 0) continue;
      expect(
        matching.some(
          (c: { level: number }) => c.level <= source.level,
        ),
      ).toBe(true);
    }
  });

  it("keeps every poem charRef pointing at an in-line ACTIVE char at level <= poem level", () => {
    const { characters } = load("character-bank.json");
    const { poems } = load("poem-bank.json");
    const charById = new Map(
      characters.map((c: { id: string }) => [c.id, c]),
    );
    for (const poem of poems) {
      const text = poem.lines.join("");
      for (const ref of poem.charRefs) {
        const char = charById.get(ref) as
          | { char: string; level: number; status: string }
          | undefined;
        expect(char).toBeDefined();
        expect(char!.status).toBe("ACTIVE");
        expect(char!.level).toBeLessThanOrEqual(poem.level);
        expect(text.includes(char!.char)).toBe(true);
      }
    }
  });
});
