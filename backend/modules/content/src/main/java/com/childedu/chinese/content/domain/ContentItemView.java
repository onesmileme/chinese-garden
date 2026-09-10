package com.childedu.chinese.content.domain;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public record ContentItemView(
    String id,
    ContentType type,
    ContentStatus status,
    int revision,
    ContentLevel level,
    ContentLevel difficulty,
    boolean promotionRequired,
    List<String> tags,
    JsonNode payload) {

  public ContentItemView {
    tags = List.copyOf(tags);
    payload = payload.deepCopy();
  }
}
