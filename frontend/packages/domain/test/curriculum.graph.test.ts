import { describe, it, expect } from "vitest";
import { validateGraph } from "../src/curriculum/graph";
import type { KnowledgePointId } from "@cc/content-schema";

const kp = (s: string) => s as KnowledgePointId;

describe("validateGraph", () => {
  it("reports no issues for a clean DAG", () => {
    const issues = validateGraph(
      [
        { id: kp("a"), prerequisites: [] },
        { id: kp("b"), prerequisites: [kp("a")] },
        { id: kp("c"), prerequisites: [kp("b")] },
      ],
      [kp("a")],
    );
    expect(issues).toEqual({ cycles: [], deadLinks: [], unreachable: [] });
  });

  it("detects a dead link to a missing prerequisite", () => {
    const issues = validateGraph(
      [{ id: kp("b"), prerequisites: [kp("missing")] }],
      [kp("b")],
    );
    expect(issues.deadLinks).toContain(kp("missing"));
  });

  it("detects a cycle", () => {
    const issues = validateGraph(
      [
        { id: kp("a"), prerequisites: [kp("b")] },
        { id: kp("b"), prerequisites: [kp("a")] },
      ],
      [],
    );
    expect(issues.cycles.length).toBeGreaterThan(0);
  });

  it("detects an unreachable node", () => {
    const issues = validateGraph(
      [
        { id: kp("a"), prerequisites: [] },
        { id: kp("island"), prerequisites: [] },
      ],
      [kp("a")],
    );
    expect(issues.unreachable).toContain(kp("island"));
  });

  it("handles a diamond DAG where a node is reached by two paths", () => {
    const issues = validateGraph(
      [
        { id: kp("a"), prerequisites: [] },
        { id: kp("b"), prerequisites: [kp("a")] },
        { id: kp("c"), prerequisites: [kp("a")] },
        { id: kp("d"), prerequisites: [kp("b"), kp("c")] },
      ],
      [kp("a")],
    );
    expect(issues.unreachable).toEqual([]);
  });

  it("ignores a root that is not among the nodes", () => {
    const issues = validateGraph(
      [{ id: kp("a"), prerequisites: [] }],
      [kp("ghost")],
    );
    expect(issues.unreachable).toContain(kp("a"));
  });
});
