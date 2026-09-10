package com.childedu.chinese.content;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.content.domain.ReleaseStatus;
import org.junit.jupiter.api.Test;

class ReleaseStatusTest {

  @Test
  void allowsForwardTransitions() {
    assertThat(ReleaseStatus.DRAFT.canTransitionTo(ReleaseStatus.VALIDATED)).isTrue();
    assertThat(ReleaseStatus.VALIDATED.canTransitionTo(ReleaseStatus.PUBLISHED)).isTrue();
    assertThat(ReleaseStatus.PUBLISHED.canTransitionTo(ReleaseStatus.RETIRED)).isTrue();
  }

  @Test
  void rejectsBackwardOrSkippingTransitions() {
    assertThat(ReleaseStatus.PUBLISHED.canTransitionTo(ReleaseStatus.DRAFT)).isFalse();
    assertThat(ReleaseStatus.DRAFT.canTransitionTo(ReleaseStatus.PUBLISHED)).isFalse();
    assertThat(ReleaseStatus.RETIRED.canTransitionTo(ReleaseStatus.PUBLISHED)).isFalse();
  }
}
