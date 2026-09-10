package com.childedu.chinese.operations.api;

import com.childedu.chinese.content.domain.ReleaseStatus;
import com.childedu.chinese.operations.application.ContentReleaseSummary;
import java.time.Instant;

public record ContentReleaseSummaryResponse(
    String version,
    String masteryRuleVersion,
    String progressionRuleVersion,
    String contentLevelRuleVersion,
    String minClientVersion,
    ReleaseStatus status,
    int artifactCount,
    Instant createdAt,
    Instant publishedAt) {

  public static ContentReleaseSummaryResponse from(ContentReleaseSummary summary) {
    return new ContentReleaseSummaryResponse(
        summary.version(),
        summary.masteryRuleVersion(),
        summary.progressionRuleVersion(),
        summary.contentLevelRuleVersion(),
        summary.minClientVersion(),
        summary.status(),
        summary.artifactCount(),
        summary.createdAt(),
        summary.publishedAt());
  }
}
