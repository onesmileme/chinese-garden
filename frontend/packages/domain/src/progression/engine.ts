import { applyXpGain, type LevelState } from "./xp";

export interface XpEvent {
  eventId: string;
  xp: number;
}
export interface ProgressionState {
  level: number;
  lifetimeXp: number;
  xpIntoLevel: number;
  appliedEventIds: string[];
}

export function settleXpEvents(
  state: ProgressionState,
  events: XpEvent[],
): ProgressionState {
  const applied = new Set(state.appliedEventIds);
  let levelState: LevelState = {
    level: state.level,
    lifetimeXp: state.lifetimeXp,
    xpIntoLevel: state.xpIntoLevel,
  };
  const appliedEventIds = [...state.appliedEventIds];

  for (const e of events) {
    if (applied.has(e.eventId)) continue;
    applied.add(e.eventId);
    appliedEventIds.push(e.eventId);
    levelState = applyXpGain(levelState, e.xp);
  }

  return {
    level: levelState.level,
    lifetimeXp: levelState.lifetimeXp,
    xpIntoLevel: levelState.xpIntoLevel,
    appliedEventIds,
  };
}

export interface WeeklyGoalState {
  completedDays: number;
  weekendChallengeUnlocked: boolean;
}

export function evaluateWeeklyGoal(completedDays: number): WeeklyGoalState {
  return { completedDays, weekendChallengeUnlocked: completedDays >= 5 };
}
