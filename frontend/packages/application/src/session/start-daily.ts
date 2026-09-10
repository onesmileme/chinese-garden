import type { Clock, IdGen } from "../ports";
import type { DailyPlan } from "@cc/domain";

export interface DailySession {
  sessionId: string;
  levels: DailyPlan;
  contentVersion: string;
  ruleVersion: string;
}

export function startDaily(deps: {
  idGen: IdGen;
  clock: Clock;
  plan: DailyPlan;
  contentVersion: string;
  ruleVersion: string;
}): DailySession {
  return {
    sessionId: deps.idGen.ulid(),
    levels: deps.plan,
    contentVersion: deps.contentVersion,
    ruleVersion: deps.ruleVersion,
  };
}
