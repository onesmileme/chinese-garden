package com.childedu.chinese.content.domain;

import java.util.List;

public record ReleaseSnapshot(
    String version,
    String masteryRuleVersion,
    String progressionRuleVersion,
    String contentLevelRuleVersion,
    String minClientVersion,
    List<ContentItemView> items) {

  public ReleaseSnapshot {
    items = List.copyOf(items);
  }
}
