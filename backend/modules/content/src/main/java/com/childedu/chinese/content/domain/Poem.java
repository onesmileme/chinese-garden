package com.childedu.chinese.content.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * 诗词语料记录（对齐 content-schema/question.ts::Poem；lines 有序，charRefs 去 K12 后为可选）。
 *
 * <p>content-schema 为诗词新增了 dynasty/genre/pinyin/translation/annotations/appreciation 等
 * 面向鉴赏的可选字段；后端判题只消费 lines 等判题必需字段，故忽略未知字段以保持向后兼容。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Poem(
    String id,
    String title,
    String author,
    List<String> lines,
    List<String> charRefs,
    int difficulty,
    int level,
    boolean promotionRequired,
    ContentStatus status,
    List<String> tags,
    int revision) {

  public Poem {
    tags = ContentMetadataValidator.validate(level, difficulty, status, tags, revision);
  }

  public ContentLevel contentLevel() {
    return ContentLevel.fromValue(level);
  }
}
