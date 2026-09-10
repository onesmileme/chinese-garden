package com.childedu.chinese.progression.domain;

import com.childedu.chinese.content.domain.ProgressionRules;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** XP 幂等结算，与 TS progression 引擎逐位一致（spec §4.2 / §10.1）。 */
public final class ProgressionEngine {

  private final ProgressionRules rules;

  public ProgressionEngine(ProgressionRules rules) {
    this.rules = rules;
  }

  public int xpToNextLevel(int level) {
    return rules.baseXpPerLevel() + rules.xpStepPerLevel() * (level - 1);
  }

  public ProgressionState settle(ProgressionState state, List<XpEvent> events) {
    Set<String> applied = new HashSet<>(state.appliedEventIds());
    List<String> appliedOrder = new ArrayList<>(state.appliedEventIds());
    int level = state.level();
    long lifetime = state.lifetimeXp();
    int intoLevel = state.xpIntoLevel();

    for (XpEvent e : events) {
      if (applied.contains(e.eventId())) {
        continue; // 幂等：重复 eventId 跳过
      }
      applied.add(e.eventId());
      appliedOrder.add(e.eventId());
      lifetime += e.xp();
      intoLevel += e.xp();
      while (level < rules.maxLevel() && intoLevel >= xpToNextLevel(level)) {
        intoLevel -= xpToNextLevel(level);
        level++;
      }
      if (level >= rules.maxLevel()) {
        intoLevel = 0; // 封顶后不再累计进度条
      }
    }
    return new ProgressionState(level, lifetime, intoLevel, List.copyOf(appliedOrder));
  }
}
