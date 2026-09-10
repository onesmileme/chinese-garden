package com.childedu.chinese.learning.domain;

import com.childedu.chinese.content.domain.Corpus;
import com.childedu.chinese.content.domain.Idiom;
import com.childedu.chinese.content.domain.QuestionType;
import java.util.Map;
import java.util.stream.Collectors;

/** Server-side authoritative answer lookup. This is intentionally RNG-free. */
public final class AnswerAuthority {

  private AnswerAuthority() {}

  /**
   * 权威答案查表（无 RNG，与 TS lookupAnswer 对齐）。
   *
   * <ul>
   *   <li>IDIOM_CHAIN → 语料顺序下首个可接龙成语
   *   <li>IDIOM_MEANING → 该成语的释义（meaning）
   *   <li>POEM_FILL / POEM_MATCH_NEXT → 挖空/选下句组合依赖 seed，权威串由客户端 generateQuestion
   *       序列化产出；POEM_FILL 服务端用 {@link #serializePoemFill(Map)} 对提交填空做同一规范序列化后比对。
   * </ul>
   */
  public static String recompute(QuestionType type, String knowledgePointId, Corpus corpus) {
    return switch (type) {
      case IDIOM_CHAIN -> firstIdiomSuccessor(corpus, knowledgePointId);
      case IDIOM_MEANING -> corpus.idiom(knowledgePointId).meaning();
      case POEM_FILL, POEM_MATCH_NEXT ->
          throw new IllegalArgumentException(
              type + " answer is seed-dependent; use generateQuestion: " + knowledgePointId);
    };
  }

  /**
   * POEM_FILL 权威规范串：按空序 {@code index=字}，升序 index，以 {@code |} 连接。
   *
   * <p>必须与 TS {@code serializePoemFill} 逐字节一致（前后端黄金向量以此比较）。空映射返回空串。
   */
  public static String serializePoemFill(Map<Integer, String> filled) {
    return filled.keySet().stream()
        .sorted()
        .map(key -> key + "=" + filled.get(key))
        .collect(Collectors.joining("|"));
  }

  private static String firstIdiomSuccessor(Corpus corpus, String knowledgePointId) {
    Idiom source = corpus.idiom(knowledgePointId);
    return corpus.idioms().stream()
        .filter(candidate -> !candidate.id().equals(source.id()))
        .filter(candidate -> candidate.headPinyin().equals(source.tailPinyin()))
        .findFirst()
        .map(Idiom::text)
        .orElseThrow(
            () -> new IllegalArgumentException("no idiom successor: " + knowledgePointId));
  }
}
