package com.childedu.chinese.content.domain;

import com.childedu.chinese.shared.RuleVersion;

public record RuleSet(
    RuleVersion masteryVersion,
    RuleVersion progressionVersion,
    RuleVersion contentLevelVersion,
    MasteryRules mastery,
    ProgressionRules progression,
    ContentLevelRules contentLevel) {

  public RuleSet(
      RuleVersion masteryVersion,
      RuleVersion progressionVersion,
      MasteryRules mastery,
      ProgressionRules progression) {
    this(masteryVersion, progressionVersion, null, mastery, progression, null);
  }
}
