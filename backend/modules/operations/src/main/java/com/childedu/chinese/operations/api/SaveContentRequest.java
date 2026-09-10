package com.childedu.chinese.operations.api;

import com.childedu.chinese.content.domain.ContentDraft;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentType;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public record SaveContentRequest(
    String id,
    ContentType type,
    ContentLevel level,
    ContentLevel difficulty,
    boolean promotionRequired,
    List<String> tags,
    JsonNode payload) {

  public ContentDraft toDraft() {
    return new ContentDraft(id, type, level, difficulty, promotionRequired, tags, payload);
  }
}
