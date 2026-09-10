import {
  applyCheckpoint,
  type AssessmentState,
  type CheckpointResult,
} from "@cc/domain";

export interface AssessmentStep {
  checkpointResult: CheckpointResult;
}

export function applyAssessmentStep(
  state: AssessmentState,
  step: AssessmentStep,
): AssessmentState {
  return applyCheckpoint(state, step.checkpointResult);
}
