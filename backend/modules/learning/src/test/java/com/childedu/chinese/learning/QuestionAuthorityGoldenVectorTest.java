package com.childedu.chinese.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.childedu.chinese.content.domain.Corpus;
import com.childedu.chinese.content.domain.QuestionType;
import com.childedu.chinese.content.infrastructure.CorpusLoader;
import com.childedu.chinese.learning.domain.AnswerAuthority;
import com.childedu.chinese.testsupport.GoldenVectors;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class QuestionAuthorityGoldenVectorTest {

  @Test
  void backendRecomputeMatchesEveryQuestionVector() {
    JsonNode root = GoldenVectors.readVector("questions.json");
    Corpus corpus = new CorpusLoader(GoldenVectors.contentRoot()).load();

    for (JsonNode c : root.get("cases")) {
      String name = c.get("name").asText();
      QuestionType type = QuestionType.valueOf(c.get("questionType").asText());
      String knowledgePointId = c.get("knowledgePointId").asText();
      JsonNode expected = c.get("expected");

      switch (type) {
        case IDIOM_CHAIN -> {
          String actual = AnswerAuthority.recompute(type, knowledgePointId, corpus);
          assertThat(actual)
              .as("%s authoritative answer", name)
              .isEqualTo(expected.get("correctAnswer").asText());
          var source = corpus.idiom(knowledgePointId);
          var successor =
              corpus.idioms().stream()
                  .filter(idiom -> idiom.text().equals(actual))
                  .findFirst()
                  .orElseThrow();
          assertThat(expected.get("correctAnswerIsSuccessor").asBoolean()).isTrue();
          assertThat(source.tailPinyin()).isEqualTo(successor.headPinyin());
        }
        case IDIOM_MEANING -> {
          // IDIOM_MEANING 为纯查表：权威答案 == 语料中该成语的释义（与 TS lookupAnswer 对齐）。
          String actual = AnswerAuthority.recompute(type, knowledgePointId, corpus);
          assertThat(actual)
              .as("%s authoritative answer", name)
              .isEqualTo(expected.get("correctAnswer").asText());
          assertThat(actual).isEqualTo(corpus.idiom(knowledgePointId).meaning());
          assertThat(corpus.idiom(knowledgePointId).text())
              .as("%s prompt is the idiom text", name)
              .isEqualTo(expected.get("prompt").asText());
        }
        case POEM_FILL -> {
          // POEM_FILL 挖空组合依赖 seed，无静态权威串；黄金向量只声明结构标记。
          assertThat(expected.get("poemFill").asBoolean())
              .as("%s declares a poem-fill vector", name)
              .isTrue();
          assertThatThrownBy(
                  () -> AnswerAuthority.recompute(type, knowledgePointId, corpus))
              .as("%s poem-fill has no static answer", name)
              .isInstanceOf(IllegalArgumentException.class)
              .hasMessageContaining("seed-dependent");
          // 权威序列化与 TS serializePoemFill 对齐（升序 index、index=字、`|` 连接）。
          List<String> chars =
              corpus.poem(knowledgePointId).lines().stream()
                  .flatMap(line -> line.codePoints().mapToObj(Character::toString))
                  .toList();
          Map<Integer, String> filled = new LinkedHashMap<>();
          filled.put(2, chars.get(2));
          filled.put(0, chars.get(0));
          assertThat(AnswerAuthority.serializePoemFill(filled))
              .as("%s poem-fill serialization is ascending and pipe-joined", name)
              .isEqualTo("0=" + chars.get(0) + "|2=" + chars.get(2));
        }
        case POEM_MATCH_NEXT -> {
          // POEM_MATCH_NEXT 依赖 seed（随机取相邻句对），无静态权威串；服务端 recompute 应拒绝。
          assertThatThrownBy(
                  () -> AnswerAuthority.recompute(type, knowledgePointId, corpus))
              .as("%s poem-match-next has no static answer", name)
              .isInstanceOf(IllegalArgumentException.class)
              .hasMessageContaining("seed-dependent");
          // 前提校验：诗至少两句才能“给上句选下句”，与 TS canGeneratePoemMatch 一致。
          assertThat(corpus.poem(knowledgePointId).lines().size())
              .as("%s poem has at least two lines", name)
              .isGreaterThanOrEqualTo(2);
        }
      }
    }
  }
}
