package com.childedu.chinese.operations.application;

import com.childedu.chinese.content.domain.ReleaseStatus;
import java.time.Instant;

public record ContentReleaseSummary(
    String version,
    String masteryRuleVersion,
    String progressionRuleVersion,
    String contentLevelRuleVersion,
    String minClientVersion,
    ReleaseStatus status,
    int artifactCount,
    Instant createdAt,
    Instant publishedAt) {}
