import { z } from "zod";
import { contentLevelSchema } from "./question";

export interface ContentReleaseManifest {
  version: string;
  ruleVersion: string;
  sha256: string;
  fileSize: number;
  minClientVersion: string;
  status: "DRAFT" | "VALIDATED" | "PUBLISHED" | "RETIRED";
}

export const contentReleaseManifestSchema = z.object({
  version: z.string().min(1),
  ruleVersion: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  fileSize: z.number().int().positive(),
  minClientVersion: z.string().min(1),
  status: z.enum(["DRAFT", "VALIDATED", "PUBLISHED", "RETIRED"]),
});

export const leveledManifestSchema = z.object({
  version: z.string().min(1),
  abilityLevel: contentLevelSchema,
  artifactUrl: z.string().url(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  fileSize: z.number().int().positive(),
  format: z.literal("tar+gzip"),
  minClientVersion: z.string().min(1),
  contentLevelRuleVersion: z.string().min(1),
  masteryRuleVersion: z.string().min(1),
  progressionRuleVersion: z.string().min(1),
});

export type LeveledManifest = z.infer<typeof leveledManifestSchema>;
