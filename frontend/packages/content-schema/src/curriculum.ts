import { z } from "zod";
import type { KnowledgePointId } from "./ids";

export interface KnowledgePoint {
  id: KnowledgePointId;
  title: string;
  prerequisites: KnowledgePointId[];
}
export interface CurriculumUnit {
  id: string;
  title: string;
  knowledgePoints: KnowledgePoint[];
}
export interface CurriculumMap {
  version: string;
  themes: { id: string; title: string; units: CurriculumUnit[] }[];
}

const knowledgePointSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prerequisites: z.array(z.string().min(1)),
});

const unitSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  knowledgePoints: z.array(knowledgePointSchema).min(1),
});

export const curriculumMapSchema = z.object({
  version: z.string().min(1),
  themes: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        units: z.array(unitSchema).min(1),
      }),
    )
    .min(1),
});
