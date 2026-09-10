package com.childedu.chinese.content.domain;

public record ContentReleaseArtifact(
    String releaseVersion,
    ContentLevel level,
    String artifactUrl,
    String sha256,
    long fileSize,
    String format,
    String masteryRuleVersion,
    String progressionRuleVersion,
    String contentLevelRuleVersion,
    String minClientVersion) {}
