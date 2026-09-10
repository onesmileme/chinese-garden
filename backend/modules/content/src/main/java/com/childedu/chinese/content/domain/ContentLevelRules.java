package com.childedu.chinese.content.domain;

import java.util.Map;
import java.util.Objects;

public record ContentLevelRules(
    String ruleVersion, Map<Integer, MinimumContent> minimumCumulativeContent) {

  public ContentLevelRules {
    if (ruleVersion == null || ruleVersion.isBlank()) {
      throw new IllegalArgumentException("content level rule version must not be blank");
    }
    minimumCumulativeContent =
        Map.copyOf(
            Objects.requireNonNull(
                minimumCumulativeContent, "minimum cumulative content"));
    if (minimumCumulativeContent.size() != ContentLevel.values().length) {
      throw new IllegalArgumentException(
          "content level rules must define exactly levels 1 through 5");
    }
    for (int level = 1; level <= 5; level++) {
      if (!minimumCumulativeContent.containsKey(level)) {
        throw new IllegalArgumentException("content level rules must define level " + level);
      }
    }
  }
}
