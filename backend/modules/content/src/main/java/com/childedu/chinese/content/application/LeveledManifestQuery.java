package com.childedu.chinese.content.application;

import com.childedu.chinese.content.api.ManifestResponse;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import com.childedu.chinese.shared.ChildProfileId;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class LeveledManifestQuery {

  private final AbilityLevelReader abilities;
  private final PublishedArtifactReader artifacts;

  public LeveledManifestQuery(
      AbilityLevelReader abilities, PublishedArtifactReader artifacts) {
    this.abilities = abilities;
    this.artifacts = artifacts;
  }

  public ManifestResponse forChild(ChildProfileId childId) {
    ContentLevel level = abilities.levelOf(childId).orElse(ContentLevel.L1);
    ContentReleaseArtifact artifact =
        artifacts
            .latestPublishedArtifact(level)
            .orElseThrow(
                () ->
                    new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "no published artifact"));
    return ManifestResponse.from(artifact);
  }
}
