package com.childedu.chinese.mastery.domain;

import com.childedu.chinese.content.domain.MasteryRules;
import java.util.List;

/** 掌握度权威执行器，与 TS packages/domain/src/mastery 逐位一致（spec §7.1 / §19）。 */
public final class MasteryEngine {

  private final MasteryRules rules;

  public MasteryEngine(MasteryRules rules) {
    this.rules = rules;
  }

  public MasterySnapshot compute(MasteryEvidence e) {
    int score =
        scoreFirstLearn(e.guidedCompleted(), e.firstLearnFirstCorrect(), e.firstLearnTotal())
            + scoreConsolidation(e.consolidationOutcomes())
            + scoreCheckpoint(e.checkpointFirstCorrect())
            + scoreDelayedReview(e.delayedReviewSessions());
    score = clamp(score, 0, 100);
    boolean hasDelayedEvidence = !e.delayedReviewSessions().isEmpty();
    MasteryStatus status = classify(score, hasDelayedEvidence, e.delayedReviewFailing());
    return new MasterySnapshot(score, status);
  }

  int scoreFirstLearn(boolean guided, int firstCorrect, int total) {
    int guidedPart = guided ? rules.guidedPoints() : 0;
    int quizPart = total == 0 ? 0 : (int) Math.round((rules.firstLearnCap() - rules.guidedPoints())
        * ((double) firstCorrect / total));
    return guidedPart + quizPart;
  }

  int scoreConsolidation(List<Boolean> outcomes) {
    if (outcomes.isEmpty()) {
      return 0;
    }
    int n = Math.min(8, outcomes.size());
    int correct = 0;
    for (int i = 0; i < n; i++) {
      if (Boolean.TRUE.equals(outcomes.get(i))) {
        correct++;
      }
    }
    return (int) Math.round(rules.consolidationCap() * ((double) correct / n));
  }

  int scoreCheckpoint(int firstCorrectCount) {
    return firstCorrectCount * (rules.checkpointCap() / 5);
  }

  int scoreDelayedReview(List<DelayedReviewSession> sessions) {
    int total = 0;
    for (DelayedReviewSession s : sessions) {
      boolean pass = s.total() > 0 && s.firstCorrect() * 5 >= rules.checkpointPassCorrect() * s.total();
      if (pass) {
        total += 5;
      }
    }
    return Math.min(total, rules.delayedReviewCap());
  }

  private MasteryStatus classify(int score, boolean hasDelayedEvidence, boolean failing) {
    if (failing) {
      return MasteryStatus.NEEDS_REPAIR;
    }
    if (score >= rules.stable() && hasDelayedEvidence) {
      return MasteryStatus.STABLE;
    }
    if (score >= rules.mastered()) {
      return MasteryStatus.MASTERED;
    }
    if (score >= rules.practicing()) {
      return MasteryStatus.PRACTICING;
    }
    return MasteryStatus.LEARNING;
  }

  private static int clamp(int v, int lo, int hi) {
    return Math.max(lo, Math.min(hi, v));
  }
}
