import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { curriculumMapSchema } from "@cc/content-schema";
import { validateGraph, type GraphNode } from "../src/curriculum/graph";

const contentDir = fileURLToPath(new URL("../../../content/", import.meta.url));
const load = (rel: string) =>
  JSON.parse(readFileSync(contentDir + rel, "utf8"));

function toNodes(
  map: ReturnType<typeof curriculumMapSchema.parse>,
): GraphNode[] {
  const nodes: GraphNode[] = [];
  for (const theme of map.themes)
    for (const unit of theme.units)
      for (const kp of unit.knowledgePoints)
        nodes.push({
          id: kp.id as GraphNode["id"],
          prerequisites: kp.prerequisites as GraphNode["prerequisites"],
        });
  return nodes;
}

describe("curriculum-v1 data", () => {
  it("parses against curriculumMapSchema", () => {
    const map = curriculumMapSchema.parse(
      load("curriculum/curriculum-v1.json"),
    );
    expect(map.version).toBe("curriculum-v1");
  });
  it("has no cycles / dead links / unreachable nodes", () => {
    const map = curriculumMapSchema.parse(
      load("curriculum/curriculum-v1.json"),
    );
    const nodes = toNodes(map);
    const roots = nodes
      .filter((n) => n.prerequisites.length === 0)
      .map((n) => n.id);
    const issues = validateGraph(nodes, roots);
    expect(issues.cycles).toEqual([]);
    expect(issues.deadLinks).toEqual([]);
    expect(issues.unreachable).toEqual([]);
  });
});
