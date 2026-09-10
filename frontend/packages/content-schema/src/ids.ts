export type KnowledgePointId = string & {
  readonly __brand: "KnowledgePointId";
};
export type TemplateId = string & { readonly __brand: "TemplateId" };

export function asKnowledgePointId(value: string): KnowledgePointId {
  if (value.length === 0) throw new Error("KnowledgePointId must not be empty");
  return value as KnowledgePointId;
}

export function asTemplateId(value: string): TemplateId {
  if (value.length === 0) throw new Error("TemplateId must not be empty");
  return value as TemplateId;
}
