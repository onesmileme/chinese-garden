package com.childedu.chinese.content.domain;

import java.util.List;

public record LevelCoverage(
    ContentLevel level,
    int characters,
    int poems,
    int chainableIdioms,
    List<ContentIssueCode> blockingIssues) {

  public LevelCoverage {
    blockingIssues = List.copyOf(blockingIssues);
  }
}
