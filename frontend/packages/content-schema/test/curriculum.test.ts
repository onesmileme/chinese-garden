import { describe, it, expect } from "vitest";
import { curriculumMapSchema } from "../src/curriculum";

const map = {
  version: "2026.07.0",
  themes: [
    {
      id: "theme.counting",
      title: "数数岛",
      units: [
        {
          id: "unit.add.within10",
          title: "10 内加法",
          knowledgePoints: [
            { id: "kp.numbersense", title: "数感", prerequisites: [] },
            {
              id: "kp.add.within10",
              title: "10 以内加法",
              prerequisites: ["kp.numbersense"],
            },
          ],
        },
      ],
    },
  ],
};

describe("curriculumMapSchema", () => {
  it("accepts a valid map", () => {
    expect(curriculumMapSchema.parse(map).version).toBe("2026.07.0");
  });

  it("rejects a map with empty version", () => {
    expect(() => curriculumMapSchema.parse({ ...map, version: "" })).toThrow();
  });

  it("rejects a knowledge point with empty id", () => {
    const bad = structuredClone(map);
    bad.themes[0].units[0].knowledgePoints[0].id = "";
    expect(() => curriculumMapSchema.parse(bad)).toThrow();
  });
});
