package com.childedu.chinese.operations.api;

import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import com.childedu.chinese.content.domain.ReleaseSnapshot;
import com.childedu.chinese.content.domain.ReleaseStatus;
import com.childedu.chinese.operations.application.ContentReleaseSummary;
import java.util.List;

public record ReleaseSnapshotResponse(
    String version,
    String masteryRuleVersion,
    String progressionRuleVersion,
    String contentLevelRuleVersion,
    String minClientVersion,
    ReleaseStatus status,
    List<ContentItemView> items,
    List<ContentReleaseArtifact> artifacts) {

  public static ReleaseSnapshotResponse from(ReleaseSnapshot snapshot) {
    return from(snapshot, ReleaseStatus.DRAFT, List.of());
  }

  public static ReleaseSnapshotResponse from(
      ReleaseSnapshot snapshot,
      ContentReleaseSummary summary,
      List<ContentReleaseArtifact> artifacts) {
    return from(snapshot, summary.status(), artifacts);
  }

  private static ReleaseSnapshotResponse from(
      ReleaseSnapshot snapshot,
      ReleaseStatus status,
      List<ContentReleaseArtifact> artifacts) {
    return new ReleaseSnapshotResponse(
        snapshot.version(),
        snapshot.masteryRuleVersion(),
        snapshot.progressionRuleVersion(),
        snapshot.contentLevelRuleVersion(),
        snapshot.minClientVersion(),
        status,
        snapshot.items(),
        artifacts);
  }
}
