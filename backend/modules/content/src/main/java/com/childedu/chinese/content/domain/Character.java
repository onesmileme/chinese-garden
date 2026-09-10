package com.childedu.chinese.content.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/** 汉字语料记录（对齐 Plan A content-schema/question.ts::Character；JSON 字段 "char" 映射到 ch）。 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Character(
    String id,
    @JsonProperty("char") String ch,
    String pinyin,
    String imageId,
    String theme,
    int strokes,
    int difficulty,
    int level,
    boolean promotionRequired,
    ContentStatus status,
    List<String> tags,
    int revision) {

  public Character {
    tags = ContentMetadataValidator.validate(level, difficulty, status, tags, revision);
  }

  public ContentLevel contentLevel() {
    return ContentLevel.fromValue(level);
  }
}
