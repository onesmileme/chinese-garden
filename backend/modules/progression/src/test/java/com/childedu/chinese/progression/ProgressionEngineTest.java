package com.childedu.chinese.progression;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.content.domain.ProgressionRules;
import com.childedu.chinese.progression.domain.ProgressionEngine;
import com.childedu.chinese.progression.domain.ProgressionState;
import com.childedu.chinese.progression.domain.XpEvent;
import java.util.List;
import org.junit.jupiter.api.Test;

class ProgressionEngineTest {

  static final ProgressionRules RULES = new ProgressionRules(30, 100, 20, 10, 5, 0.9, 5);
  static final ProgressionEngine ENGINE = new ProgressionEngine(RULES);

  static ProgressionState fresh() {
    return new ProgressionState(1, 0, 0, List.of());
  }

  @Test
  void xpToNextLevelFollowsFormula() {
    assertThat(ENGINE.xpToNextLevel(1)).isEqualTo(100); // 100 + 20*0
    assertThat(ENGINE.xpToNextLevel(2)).isEqualTo(120); // 100 + 20*1
    assertThat(ENGINE.xpToNextLevel(5)).isEqualTo(180);
  }

  @Test
  void singleEventLevelsUpAndCarriesRemainder() {
    ProgressionState s = ENGINE.settle(fresh(), List.of(new XpEvent("e1", 130)));
    assertThat(s.level()).isEqualTo(2);
    assertThat(s.lifetimeXp()).isEqualTo(130);
    assertThat(s.xpIntoLevel()).isEqualTo(30); // 130 - 100
    assertThat(s.appliedEventIds()).containsExactly("e1");
  }

  @Test
  void duplicateEventIdsAreIgnored() {
    ProgressionState once = ENGINE.settle(fresh(), List.of(new XpEvent("e1", 130)));
    ProgressionState twice = ENGINE.settle(once, List.of(new XpEvent("e1", 130)));
    assertThat(twice.lifetimeXp()).isEqualTo(130); // 未重复计入
    assertThat(twice.level()).isEqualTo(2);
    assertThat(twice.appliedEventIds()).containsExactly("e1");
  }

  @Test
  void stopsLevelingAtMaxButKeepsAccumulatingLifetimeXp() {
    // 直接灌入巨量 XP：等级封顶 30，lifetimeXp 仍累加
    ProgressionState s = ENGINE.settle(fresh(), List.of(new XpEvent("big", 1_000_000)));
    assertThat(s.level()).isEqualTo(30);
    assertThat(s.lifetimeXp()).isEqualTo(1_000_000);
  }

  @Test
  void multipleEventsAccumulateInOrder() {
    ProgressionState s =
        ENGINE.settle(
            fresh(), List.of(new XpEvent("a", 60), new XpEvent("b", 60), new XpEvent("c", 60)));
    assertThat(s.lifetimeXp()).isEqualTo(180);
    assertThat(s.level()).isEqualTo(2); // 100 到 L2，剩 80 未到 120
    assertThat(s.xpIntoLevel()).isEqualTo(80);
  }
}
