import { z } from "zod";

export interface MasteryRules {
  ruleVersion: string;
  evidenceCaps: {
    firstLearn: 40;
    consolidation: 25;
    checkpoint: 25;
    delayedReview: 10;
  };
  guidedPoints: 20;
  statusThresholds: { practicing: 40; mastered: 70; stable: 85 };
  checkpointPassCorrect: 4;
}
export interface ProgressionRules {
  ruleVersion: string;
  maxLevel: 30;
  baseXpPerLevel: 100;
  xpStepPerLevel: 20;
  accuracyBonus: { full: 10; high: 5; highThreshold: 0.9 };
  weeklyGoalDays: 5;
}
export interface MinimumContent {
  characters: number;
  poems: number;
  chainableIdioms: number;
}
export interface ContentLevelRules {
  ruleVersion: "content-level-v1";
  minimumCumulativeContent: Record<
    "1" | "2" | "3" | "4" | "5",
    MinimumContent
  >;
}

export const masteryRulesSchema = z
  .object({
    ruleVersion: z.string().min(1),
    evidenceCaps: z.object({
      firstLearn: z.number().int().nonnegative(),
      consolidation: z.number().int().nonnegative(),
      checkpoint: z.number().int().nonnegative(),
      delayedReview: z.number().int().nonnegative(),
    }),
    guidedPoints: z.number().int().nonnegative(),
    statusThresholds: z.object({
      practicing: z.number().int(),
      mastered: z.number().int(),
      stable: z.number().int(),
    }),
    checkpointPassCorrect: z.number().int().min(0).max(5),
  })
  .refine(
    (r) => {
      const c = r.evidenceCaps;
      return (
        c.firstLearn + c.consolidation + c.checkpoint + c.delayedReview === 100
      );
    },
    { message: "evidence caps must sum to 100" },
  );

export const progressionRulesSchema = z.object({
  ruleVersion: z.string().min(1),
  maxLevel: z.number().int().positive(),
  baseXpPerLevel: z.number().int().positive(),
  xpStepPerLevel: z.number().int().nonnegative(),
  accuracyBonus: z.object({
    full: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    highThreshold: z.number().min(0).max(1),
  }),
  weeklyGoalDays: z.number().int().min(1).max(7),
});

const minimumContentSchema = z
  .object({
    characters: z.number().int().nonnegative(),
    poems: z.number().int().nonnegative(),
    chainableIdioms: z.number().int().nonnegative(),
  })
  .strict();

export const contentLevelRulesSchema = z
  .object({
    ruleVersion: z.literal("content-level-v1"),
    minimumCumulativeContent: z
      .object({
        "1": minimumContentSchema,
        "2": minimumContentSchema,
        "3": minimumContentSchema,
        "4": minimumContentSchema,
        "5": minimumContentSchema,
      })
      .strict(),
  })
  .strict();
