import { describe, it, expect } from "vitest";
import { asKnowledgePointId, asTemplateId } from "../src/ids";

describe("branded ids", () => {
  it("wraps a non-empty string as KnowledgePointId", () => {
    expect(asKnowledgePointId("kp.add.within10")).toBe("kp.add.within10");
  });

  it("wraps a non-empty string as TemplateId", () => {
    expect(asTemplateId("tpl.add.choice.1")).toBe("tpl.add.choice.1");
  });

  it("rejects empty knowledge point id", () => {
    expect(() => asKnowledgePointId("")).toThrow(/empty/);
  });

  it("rejects empty template id", () => {
    expect(() => asTemplateId("")).toThrow(/empty/);
  });
});
