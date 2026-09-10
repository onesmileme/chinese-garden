package com.childedu.chinese.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.childedu.chinese.content.domain.ContentIssue;
import com.childedu.chinese.content.domain.ContentIssueCode;
import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentLevelRules;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import com.childedu.chinese.content.domain.ContentValidator;
import com.childedu.chinese.content.domain.LevelCoverage;
import com.childedu.chinese.content.domain.MinimumContent;
import com.childedu.chinese.content.infrastructure.RuleSetLoader;
import com.childedu.chinese.shared.RuleVersion;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ContentValidatorTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Test
  void rejectsPoemWhenReferencedCharacterIsAboveThePoemLevel() {
    ContentItemView hardCharacter = character("hz-hard", ContentLevel.L3, "难", "nán");
    ContentItemView poem = poem("sc-low", ContentLevel.L2, List.of("hz-hard"));

    assertThat(validator().validateItem(poem, List.of(hardCharacter)))
        .extracting(ContentIssue::code)
        .containsExactly(ContentIssueCode.POEM_CHAR_LEVEL_TOO_HIGH);
  }

  @Test
  void rejectsPoemWhenReferencedCharacterDoesNotExist() {
    ContentItemView poem = poem("sc-missing", ContentLevel.L2, List.of("hz-missing"));

    assertThat(validator().validateItem(poem, List.of()))
        .extracting(ContentIssue::code)
        .containsExactly(ContentIssueCode.POEM_CHAR_REF_MISSING);
  }

  @Test
  void rejectsPoemWhenReferencedCharacterIsNotActive() {
    ContentItemView draftCharacter =
        withStatus(
            character("hz-draft", ContentLevel.L1, "月", "yuè"),
            ContentStatus.DRAFT);
    ContentItemView poem = poem("sc-draft-ref", ContentLevel.L1, List.of("hz-draft"));

    assertThat(validator().validateItem(poem, List.of(draftCharacter)))
        .extracting(ContentIssue::code)
        .containsExactly(ContentIssueCode.POEM_CHAR_REF_MISSING);
  }

  @Test
  void acceptsPoemReferencesAtTheSameOrLowerLevel() {
    ContentItemView easy = character("hz-easy", ContentLevel.L1, "月", "yuè");
    ContentItemView same = character("hz-same", ContentLevel.L2, "光", "guāng");
    ContentItemView poem =
        poem("sc-valid", ContentLevel.L2, List.of("hz-easy", "hz-same"));

    assertThat(validator().validateItem(poem, List.of(easy, same))).isEmpty();
  }

  @Test
  void rejectsIdiomWithoutAChainSuccessorAtItsLevel() {
    ContentItemView source = idiom("cy-source", ContentLevel.L1, "马到成功", "ma", "gong");
    ContentItemView tooHard =
        idiom("cy-hard", ContentLevel.L2, "功成名就", "gong", "jiu");

    assertThat(validator().validateItem(source, List.of(tooHard)))
        .extracting(ContentIssue::code)
        .containsExactly(ContentIssueCode.IDIOM_CHAIN_BROKEN_AT_LEVEL);
  }

  @Test
  void acceptsToneFreeIdiomPinyinAndSameLevelSuccessor() {
    ContentItemView source = idiom("cy-source", ContentLevel.L1, "马到成功", "ma", "gong");
    ContentItemView successor =
        idiom("cy-successor", ContentLevel.L1, "功成名就", "gong", "jiu");

    assertThat(validator().validateItem(source, List.of(successor))).isEmpty();
  }

  @Test
  void rejectsIdiomWhenItsOnlySuccessorIsNotActive() {
    ContentItemView source = idiom("cy-source", ContentLevel.L1, "马到成功", "ma", "gong");
    ContentItemView draftSuccessor =
        withStatus(
            idiom("cy-successor", ContentLevel.L1, "功成名就", "gong", "jiu"),
            ContentStatus.DRAFT);

    assertThat(validator().validateItem(source, List.of(draftSuccessor)))
        .extracting(ContentIssue::code)
        .containsExactly(ContentIssueCode.IDIOM_CHAIN_BROKEN_AT_LEVEL);
  }

  @Test
  void rejectsIdiomPinyinThatIsNotLowercaseAndToneFree() {
    ContentItemView source = idiom("cy-source", ContentLevel.L1, "马到成功", "mǎ", "Gong");

    assertThat(validator().validateItem(source, List.of()))
        .extracting(ContentIssue::code)
        .containsExactly(ContentIssueCode.CONTENT_FIELD_INVALID);
  }

  @Test
  void rejectsDuplicateStableIdsInTheCatalog() {
    ContentItemView candidate = character("hz-new", ContentLevel.L1, "新", "xīn");
    ContentItemView first = character("hz-duplicate", ContentLevel.L1, "月", "yuè");
    ContentItemView second = character("hz-duplicate", ContentLevel.L2, "光", "guāng");

    assertThat(validator().validateItem(candidate, List.of(first, second)))
        .extracting(ContentIssue::code)
        .containsExactly(ContentIssueCode.CONTENT_ID_DUPLICATE);
  }

  @Test
  void reportsCumulativeCountsAndRuleDrivenBlockingIssuesForAllFiveLevels() {
    List<ContentItemView> catalog =
        List.of(
            character("hz-one", ContentLevel.L1, "一", "yī"),
            character("hz-two", ContentLevel.L2, "二", "èr"),
            poem("sc-one", ContentLevel.L1, List.of("hz-one")),
            idiom("cy-a", ContentLevel.L1, "马到成功", "ma", "gong"),
            idiom("cy-b", ContentLevel.L1, "功成名就", "gong", "jiu"));

    List<LevelCoverage> coverage = validator().coverage(catalog);

    assertThat(coverage).extracting(LevelCoverage::level).containsExactly(ContentLevel.values());
    assertThat(coverage.getFirst().characters()).isEqualTo(1);
    assertThat(coverage.get(1).characters()).isEqualTo(2);
    assertThat(coverage.getFirst().chainableIdioms()).isEqualTo(1);
    assertThat(coverage.getFirst().blockingIssues())
        .containsExactly(ContentIssueCode.LEVEL_CONTENT_INSUFFICIENT);
  }

  @Test
  void coverageCountsOnlyActiveContent() {
    List<ContentItemView> catalog =
        List.of(
            character("hz-active", ContentLevel.L1, "一", "yī"),
            withStatus(
                character("hz-draft", ContentLevel.L1, "二", "èr"),
                ContentStatus.DRAFT),
            withStatus(
                character("hz-archived", ContentLevel.L1, "三", "sān"),
                ContentStatus.ARCHIVED));

    assertThat(validator().coverage(catalog).getFirst().characters()).isEqualTo(1);
  }

  @Test
  void loadsVersionedContentLevelRulesFromSharedJson(@TempDir Path dir) throws Exception {
    Path rulesDirectory = Files.createDirectories(dir.resolve("rules"));
    Files.writeString(
        rulesDirectory.resolve("content-level-v1.json"),
        """
        {
          "ruleVersion": "content-level-v1",
          "minimumCumulativeContent": {
            "1": { "characters": 10, "poems": 1, "chainableIdioms": 8 },
            "2": { "characters": 20, "poems": 3, "chainableIdioms": 15 },
            "3": { "characters": 40, "poems": 6, "chainableIdioms": 20 },
            "4": { "characters": 60, "poems": 10, "chainableIdioms": 30 },
            "5": { "characters": 80, "poems": 15, "chainableIdioms": 40 }
          }
        }
        """);

    ContentLevelRules rules =
        new RuleSetLoader(dir).loadContentLevel(new RuleVersion("content-level-v1"));

    assertThat(rules.ruleVersion()).isEqualTo("content-level-v1");
    assertThat(rules.minimumCumulativeContent()).hasSize(5);
    assertThat(rules.minimumCumulativeContent().get(3))
        .isEqualTo(new MinimumContent(40, 6, 20));
  }

  @Test
  void rejectsContentLevelRulesWithUnexpectedLevels() {
    MinimumContent none = new MinimumContent(0, 0, 0);
    Map<Integer, MinimumContent> minimums =
        Map.of(1, none, 2, none, 3, none, 4, none, 5, none, 6, none);

    assertThatThrownBy(
            () -> new ContentLevelRules("content-level-test", minimums))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("exactly levels 1 through 5");
  }

  private static ContentValidator validator() {
    Map<Integer, MinimumContent> minimums =
        Map.of(
            1, new MinimumContent(2, 1, 2),
            2, new MinimumContent(3, 2, 3),
            3, new MinimumContent(4, 3, 4),
            4, new MinimumContent(5, 4, 5),
            5, new MinimumContent(6, 5, 6));
    return new ContentValidator(
        MAPPER, new ContentLevelRules("content-level-test", minimums));
  }

  private static ContentItemView character(
      String id, ContentLevel level, String character, String pinyin) {
    return item(
        id,
        ContentType.CHARACTER,
        level,
        json(
            """
            {"char":"%s","pinyin":"%s"}
            """
                .formatted(character, pinyin)));
  }

  private static ContentItemView poem(
      String id, ContentLevel level, List<String> characterReferences) {
    List<String> quotedReferences = new ArrayList<>();
    characterReferences.forEach(reference -> quotedReferences.add("\"" + reference + "\""));
    return item(
        id,
        ContentType.POEM,
        level,
        json(
            """
            {"title":"静夜思","author":"李白","lines":["床前明月光"],"charRefs":[%s]}
            """
                .formatted(String.join(",", quotedReferences))));
  }

  private static ContentItemView idiom(
      String id, ContentLevel level, String text, String headPinyin, String tailPinyin) {
    return item(
        id,
        ContentType.IDIOM,
        level,
        json(
            """
            {"text":"%s","meaning":"测试","headPinyin":"%s","tailPinyin":"%s"}
            """
                .formatted(text, headPinyin, tailPinyin)));
  }

  private static ContentItemView item(
      String id, ContentType type, ContentLevel level, JsonNode payload) {
    return new ContentItemView(
        id,
        type,
        ContentStatus.ACTIVE,
        1,
        level,
        level,
        false,
        List.of(),
        payload);
  }

  private static ContentItemView withStatus(
      ContentItemView item, ContentStatus status) {
    return new ContentItemView(
        item.id(),
        item.type(),
        status,
        item.revision(),
        item.level(),
        item.difficulty(),
        item.promotionRequired(),
        item.tags(),
        item.payload());
  }

  private static JsonNode json(String value) {
    try {
      return MAPPER.readTree(value);
    } catch (Exception error) {
      throw new IllegalArgumentException(error);
    }
  }
}
