package com.childedu.chinese.content.application;

import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import java.util.Optional;

@FunctionalInterface
public interface PublishedArtifactReader {
  Optional<ContentReleaseArtifact> latestPublishedArtifact(ContentLevel level);
}
