package com.childedu.chinese.content.api;

import com.childedu.chinese.content.domain.ContentReleaseArtifact;

public record ManifestResponse(
    String version,
    int abilityLevel,
    String artifactUrl,
    String sha256,
    long fileSize,
    String format,
    String minClientVersion,
    String contentLevelRuleVersion,
    String masteryRuleVersion,
    String progressionRuleVersion) {

  public static ManifestResponse from(ContentReleaseArtifact artifact) {
    return new ManifestResponse(
        artifact.releaseVersion(),
        artifact.level().value(),
        artifact.artifactUrl(),
        artifact.sha256(),
        artifact.fileSize(),
        artifact.format(),
        artifact.minClientVersion(),
        artifact.contentLevelRuleVersion(),
        artifact.masteryRuleVersion(),
        artifact.progressionRuleVersion());
  }
}
