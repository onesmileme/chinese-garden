package com.childedu.chinese.content.domain;

import java.util.List;
import java.util.Objects;

final class ContentMetadataValidator {

  private ContentMetadataValidator() {}

  static List<String> validate(
      int level, int difficulty, ContentStatus status, List<String> tags, int revision) {
    ContentLevel.fromValue(level);
    ContentLevel.fromValue(difficulty);
    Objects.requireNonNull(status, "content status");
    Objects.requireNonNull(tags, "content tags");
    if (tags.stream().anyMatch(tag -> tag == null || tag.trim().isEmpty())) {
      throw new IllegalArgumentException("content tags must be non-blank");
    }
    if (revision < 1) {
      throw new IllegalArgumentException("content revision must be positive");
    }
    return List.copyOf(tags);
  }
}
