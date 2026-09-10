package com.childedu.chinese.content.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * Authored four-character idiom with tone-free chain keys.
 *
 * <p>content-schema 为成语新增了 pinyin/origin/example/synonyms/antonyms 等面向成人的可选字段；
 * 后端判题只消费 text/meaning/headPinyin/tailPinyin，故忽略未知字段以保持向后兼容。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Idiom(
    String id,
    String text,
    String meaning,
    String headPinyin,
    String tailPinyin,
    int difficulty,
    int level,
    boolean promotionRequired,
    ContentStatus status,
    List<String> tags,
    int revision) {

  public Idiom {
    tags = ContentMetadataValidator.validate(level, difficulty, status, tags, revision);
  }

  public ContentLevel contentLevel() {
    return ContentLevel.fromValue(level);
  }
}
