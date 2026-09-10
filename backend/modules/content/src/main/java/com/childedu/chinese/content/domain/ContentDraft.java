package com.childedu.chinese.content.domain;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Objects;

public record ContentDraft(
    String id,
    ContentType type,
    ContentLevel level,
    ContentLevel difficulty,
    boolean promotionRequired,
    List<String> tags,
    JsonNode payload) {

  public ContentDraft {
    if (id == null || id.isBlank()) {
      throw new IllegalArgumentException("content id must not be blank");
    }
    Objects.requireNonNull(type, "content type");
    Objects.requireNonNull(level, "content level");
    Objects.requireNonNull(difficulty, "content difficulty");
    Objects.requireNonNull(tags, "content tags");
    if (tags.stream().anyMatch(tag -> tag == null || tag.isBlank())) {
      throw new IllegalArgumentException("content tags must be non-blank");
    }
    tags = List.copyOf(tags);
    payload = Objects.requireNonNull(payload, "content payload").deepCopy();
  }
}
