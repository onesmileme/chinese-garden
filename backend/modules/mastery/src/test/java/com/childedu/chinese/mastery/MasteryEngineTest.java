package com.childedu.chinese.mastery;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.content.domain.MasteryRules;
import com.childedu.chinese.mastery.domain.DelayedReviewSession;
import com.childedu.chinese.mastery.domain.MasteryEngine;
import com.childedu.chinese.mastery.domain.MasteryEvidence;
import com.childedu.chinese.mastery.domain.MasterySnapshot;
import com.childedu.chinese.mastery.domain.MasteryStatus;
import java.util.List;
import org.junit.jupiter.api.Test;

class MasteryEngineTest {

  static final MasteryRules RULES =
      new MasteryRules(40, 25, 25, 10, 20, 40, 70, 85, 4);
  static final MasteryEngine ENGINE = new MasteryEngine(RULES);

  static List<Boolean> eight(boolean v) {
    return List.of(v, v, v, v, v, v, v, v);
  }

  @Test
  void emptyEvidenceIsLearningZero() {
    MasterySnapshot s =
        ENGINE.compute(
            new MasteryEvidence(false, 0, 5, List.of(), 0, List.of(), false));
    assertThat(s.score()).isZero();
    assertThat(s.status()).isEqualTo(MasteryStatus.LEARNING);
  }

  @Test
  void fullEvidenceIsStable100() {
    MasterySnapshot s =
        ENGINE.compute(
            new MasteryEvidence(
                true, 5, 5, eight(true), 5,
                List.of(new DelayedReviewSession(5, 5), new DelayedReviewSession(5, 5)),
                false));
    assertThat(s.score()).isEqualTo(100);
    assertThat(s.status()).isEqualTo(MasteryStatus.STABLE);
  }

  @Test
  void masteredWithoutDelayedReview() {
    // 40 + 25 + checkpoint(1*5)=5 + 0 = 70
    MasterySnapshot s =
        ENGINE.compute(
            new MasteryEvidence(true, 5, 5, eight(true), 1, List.of(), false));
    assertThat(s.score()).isEqualTo(70);
    assertThat(s.status()).isEqualTo(MasteryStatus.MASTERED);
  }

  @Test
  void needsRepairOverridesEvenWithHighScore() {
    // 40 + 25 + 25 = 90，但 delayedReviewFailing=true
    MasterySnapshot s =
        ENGINE.compute(
            new MasteryEvidence(
                true, 5, 5, eight(true), 5,
                List.of(new DelayedReviewSession(2, 5)), true));
    assertThat(s.score()).isEqualTo(90);
    assertThat(s.status()).isEqualTo(MasteryStatus.NEEDS_REPAIR);
  }

  @Test
  void practicingBoundaryAt40() {
    // guided 20 + round(20*1)=20 → 40，无其它证据
    MasterySnapshot s =
        ENGINE.compute(new MasteryEvidence(true, 5, 5, List.of(), 0, List.of(), false));
    assertThat(s.score()).isEqualTo(40);
    assertThat(s.status()).isEqualTo(MasteryStatus.PRACTICING);
  }

  @Test
  void roundsFirstLearnAndConsolidation() {
    // firstLearn: guided20 + round(20 * 3/5=0.6 →12)=32
    // consolidation: round(25 * 5/8=0.625 →16)=16 → 合计 48
    MasterySnapshot s =
        ENGINE.compute(
            new MasteryEvidence(
                true, 3, 5,
                List.of(true, true, true, true, true, false, false, false),
                0, List.of(), false));
    assertThat(s.score()).isEqualTo(48);
    assertThat(s.status()).isEqualTo(MasteryStatus.PRACTICING);
  }

  @Test
  void delayedReviewCapsAtTen() {
    // 三次成功复习 = 15，clamp 到 10
    MasterySnapshot s =
        ENGINE.compute(
            new MasteryEvidence(
                false, 0, 5, List.of(), 0,
                List.of(
                    new DelayedReviewSession(5, 5),
                    new DelayedReviewSession(4, 5),
                    new DelayedReviewSession(5, 5)),
                false));
    assertThat(s.score()).isEqualTo(10);
  }
}
