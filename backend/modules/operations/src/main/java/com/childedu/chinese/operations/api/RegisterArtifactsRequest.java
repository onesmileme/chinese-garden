package com.childedu.chinese.operations.api;

import java.util.List;

public record RegisterArtifactsRequest(List<ArtifactInput> artifacts) {

  public RegisterArtifactsRequest {
    artifacts = List.copyOf(artifacts);
  }

  public record ArtifactInput(
      int level, String artifactUrl, String sha256, long fileSize, String format) {}
}
