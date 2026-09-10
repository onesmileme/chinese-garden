package com.childedu.chinese.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.Corpus;
import com.childedu.chinese.content.domain.Idiom;
import com.childedu.chinese.content.domain.Poem;
import com.childedu.chinese.content.domain.QuestionType;
import com.childedu.chinese.learning.domain.AnswerAuthority;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AnswerAuthorityTest {

  // 古文乐园：仅诗词/成语题型，characters 作为可选 plumbing 保留为空。
  private static final Corpus CORPUS =
      new Corpus(
          List.of(),
          List.of(
              new Poem(
                  "sc-jingyesi",
                  "静夜思",
                  "李白",
                  List.of("床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"),
                  List.of(),
                  2,
                  2,
                  true,
                  ContentStatus.ACTIVE,
                  List.of(),
                  1)),
          List.of(
              new Idiom(
                  "cy-madaochenggong",
                  "马到成功",
                  "事情顺利，很快取得成功",
                  "ma",
                  "gong",
                  1,
                  1,
                  true,
                  ContentStatus.ACTIVE,
                  List.of(),
                  1),
              new Idiom(
                  "cy-gongshigongban",
                  "公事公办",
                  "按公事原则处理",
                  "gong",
                  "ban",
                  1,
                  1,
                  true,
                  ContentStatus.ACTIVE,
                  List.of(),
                  1)));

  @Test
  void recomputesIdiomMeaningFromCorpus() {
    // IDIOM_MEANING 为纯查表，与 TS lookupAnswer("IDIOM_MEANING") 一致。
    assertThat(AnswerAuthority.recompute(QuestionType.IDIOM_MEANING, "cy-madaochenggong", CORPUS))
        .isEqualTo("事情顺利，很快取得成功");
  }

  @Test
  void rejectsUnknownKnowledgePoint() {
    assertThatThrownBy(
            () -> AnswerAuthority.recompute(QuestionType.IDIOM_MEANING, "cy-none", CORPUS))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void poemFillHasNoStaticAnswerBecauseItIsSeedDependent() {
    assertThatThrownBy(
            () -> AnswerAuthority.recompute(QuestionType.POEM_FILL, "sc-jingyesi", CORPUS))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("seed-dependent");
  }

  @Test
  void poemMatchNextHasNoStaticAnswerBecauseItIsSeedDependent() {
    assertThatThrownBy(
            () -> AnswerAuthority.recompute(QuestionType.POEM_MATCH_NEXT, "sc-jingyesi", CORPUS))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("seed-dependent");
  }

  @Test
  void serializesPoemFillByAscendingBlankIndexMatchingTypeScript() {
    // 与 TS serializePoemFill 逐字节一致：升序 index、`index=字`、以 `|` 连接。
    assertThat(AnswerAuthority.serializePoemFill(Map.of(2, "月", 0, "床", 4, "举")))
        .isEqualTo("0=床|2=月|4=举");
    assertThat(AnswerAuthority.serializePoemFill(Map.of(0, "床"))).isEqualTo("0=床");
    assertThat(AnswerAuthority.serializePoemFill(Map.of())).isEmpty();
  }

  @Test
  void recomputesTheFirstIdiomSuccessorInCorpusOrder() {
    assertThat(
            AnswerAuthority.recompute(
                QuestionType.IDIOM_CHAIN, "cy-madaochenggong", CORPUS))
        .isEqualTo("公事公办");
  }

  @Test
  void rejectsIdiomChainWhenSourceHasNoSuccessor() {
    Corpus corpusWithoutSuccessor =
        new Corpus(
            List.of(),
            List.of(),
            List.of(
                new Idiom(
                    "cy-madaochenggong",
                    "马到成功",
                    "事情顺利，很快取得成功",
                    "ma",
                    "gong",
                    1,
                    1,
                    true,
                    ContentStatus.ACTIVE,
                    List.of(),
                    1)));

    assertThatThrownBy(
            () ->
                AnswerAuthority.recompute(
                    QuestionType.IDIOM_CHAIN,
                    "cy-madaochenggong",
                    corpusWithoutSuccessor))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("no idiom successor");
  }
}
