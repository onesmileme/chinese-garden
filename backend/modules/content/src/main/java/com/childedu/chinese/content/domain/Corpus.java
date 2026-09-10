package com.childedu.chinese.content.domain;

import java.util.List;

/** 语料集合：按 id 查字/诗/成语，找不到抛异常（权威答案查表的唯一数据源）。 */
public record Corpus(List<Character> characters, List<Poem> poems, List<Idiom> idioms) {

  public Character character(String id) {
    return characters.stream()
        .filter(c -> c.id().equals(id))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("unknown character: " + id));
  }

  public Poem poem(String id) {
    return poems.stream()
        .filter(p -> p.id().equals(id))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("unknown poem: " + id));
  }

  public Idiom idiom(String id) {
    return idioms.stream()
        .filter(i -> i.id().equals(id))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("unknown idiom: " + id));
  }
}
