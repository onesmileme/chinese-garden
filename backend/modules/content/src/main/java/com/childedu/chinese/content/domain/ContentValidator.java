package com.childedu.chinese.content.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Pattern;

public final class ContentValidator {

  private static final Pattern TONE_FREE_PINYIN = Pattern.compile("[a-z]+");

  private final ObjectMapper objectMapper;
  private final ContentLevelRules rules;

  public ContentValidator(ObjectMapper objectMapper, ContentLevelRules rules) {
    this.objectMapper = Objects.requireNonNull(objectMapper, "object mapper");
    this.rules = Objects.requireNonNull(rules, "content level rules");
  }

  public List<ContentIssue> validateItem(
      ContentItemView candidate, List<ContentItemView> catalog) {
    Objects.requireNonNull(candidate, "candidate content item");
    List<ContentItemView> currentCatalog = List.copyOf(catalog);
    List<ContentIssue> issues = new ArrayList<>();
    addDuplicateIssues(currentCatalog, issues);

    switch (candidate.type()) {
      case CHARACTER -> validateCharacter(candidate, issues);
      case POEM -> validatePoem(candidate, currentCatalog, issues);
      case IDIOM -> validateIdiom(candidate, currentCatalog, issues);
    }
    return List.copyOf(issues);
  }

  public List<LevelCoverage> coverage(List<ContentItemView> catalog) {
    List<ContentItemView> available =
        catalog.stream().filter(item -> item.status() == ContentStatus.ACTIVE).toList();
    List<LevelCoverage> coverage = new ArrayList<>(ContentLevel.values().length);

    for (ContentLevel level : ContentLevel.values()) {
      Predicate<ContentItemView> included = item -> item.level().value() <= level.value();
      int characters = count(available, included, ContentType.CHARACTER);
      int poems = count(available, included, ContentType.POEM);
      int chainableIdioms = countChainableIdioms(available, level);
      MinimumContent minimum = rules.minimumCumulativeContent().get(level.value());
      List<ContentIssueCode> blockingIssues =
          characters < minimum.characters()
                  || poems < minimum.poems()
                  || chainableIdioms < minimum.chainableIdioms()
              ? List.of(ContentIssueCode.LEVEL_CONTENT_INSUFFICIENT)
              : List.of();
      coverage.add(
          new LevelCoverage(level, characters, poems, chainableIdioms, blockingIssues));
    }
    return List.copyOf(coverage);
  }

  private void validateCharacter(ContentItemView item, List<ContentIssue> issues) {
    CharacterPayload payload = parse(item, CharacterPayload.class, issues);
    if (payload == null) {
      return;
    }
    if (isBlank(payload.character()) || isBlank(payload.pinyin())) {
      issues.add(
          invalid(item.id(), "/payload", "character and pinyin must not be blank"));
    }
  }

  private void validatePoem(
      ContentItemView item, List<ContentItemView> catalog, List<ContentIssue> issues) {
    PoemPayload payload = parse(item, PoemPayload.class, issues);
    if (payload == null) {
      return;
    }
    if (isBlank(payload.title())
        || isBlank(payload.author())
        || payload.lines() == null
        || payload.lines().isEmpty()
        || payload.lines().stream().anyMatch(ContentValidator::isBlank)
        || payload.charRefs() == null) {
      issues.add(invalid(item.id(), "/payload", "poem fields must be complete"));
      return;
    }

    Map<String, ContentItemView> characters = new HashMap<>();
    catalog.stream()
        .filter(entry -> entry.type() == ContentType.CHARACTER)
        .filter(entry -> entry.status() == ContentStatus.ACTIVE)
        .forEach(entry -> characters.putIfAbsent(entry.id(), entry));
    for (int index = 0; index < payload.charRefs().size(); index++) {
      String reference = payload.charRefs().get(index);
      ContentItemView character = characters.get(reference);
      String path = "/payload/charRefs/" + index;
      if (character == null) {
        issues.add(
            new ContentIssue(
                ContentIssueCode.POEM_CHAR_REF_MISSING,
                item.id(),
                path,
                "referenced character does not exist: " + reference));
      } else if (character.level().value() > item.level().value()) {
        issues.add(
            new ContentIssue(
                ContentIssueCode.POEM_CHAR_LEVEL_TOO_HIGH,
                item.id(),
                path,
                "referenced character level exceeds poem level: " + reference));
      }
    }
  }

  private void validateIdiom(
      ContentItemView item, List<ContentItemView> catalog, List<ContentIssue> issues) {
    IdiomPayload payload = parse(item, IdiomPayload.class, issues);
    if (payload == null) {
      return;
    }
    if (isBlank(payload.text())
        || isBlank(payload.meaning())
        || !isToneFreePinyin(payload.headPinyin())
        || !isToneFreePinyin(payload.tailPinyin())) {
      issues.add(
          invalid(
              item.id(),
              "/payload",
              "idiom fields must be complete and chain pinyin must be lowercase and tone-free"));
      return;
    }

    boolean hasSuccessor =
        catalog.stream()
            .filter(entry -> entry.type() == ContentType.IDIOM)
            .filter(entry -> entry.status() == ContentStatus.ACTIVE)
            .filter(entry -> !entry.id().equals(item.id()))
            .filter(entry -> entry.level().value() <= item.level().value())
            .map(entry -> parseQuietly(entry, IdiomPayload.class))
            .filter(Objects::nonNull)
            .anyMatch(next -> payload.tailPinyin().equals(next.headPinyin()));
    if (!hasSuccessor) {
      issues.add(
          new ContentIssue(
              ContentIssueCode.IDIOM_CHAIN_BROKEN_AT_LEVEL,
              item.id(),
              "/payload/tailPinyin",
              "idiom has no chain successor at or below its level"));
    }
  }

  private void addDuplicateIssues(
      List<ContentItemView> catalog, List<ContentIssue> issues) {
    Set<String> seen = new HashSet<>();
    Set<String> reported = new HashSet<>();
    for (ContentItemView item : catalog) {
      if (!seen.add(item.id()) && reported.add(item.id())) {
        issues.add(
            new ContentIssue(
                ContentIssueCode.CONTENT_ID_DUPLICATE,
                item.id(),
                "/id",
                "content id must be unique"));
      }
    }
  }

  private int count(
      List<ContentItemView> catalog,
      Predicate<ContentItemView> included,
      ContentType type) {
    return (int)
        catalog.stream().filter(included).filter(item -> item.type() == type).count();
  }

  private int countChainableIdioms(
      List<ContentItemView> catalog, ContentLevel coverageLevel) {
    List<ParsedIdiom> idioms =
        catalog.stream()
            .filter(item -> item.type() == ContentType.IDIOM)
            .filter(item -> item.level().value() <= coverageLevel.value())
            .map(item -> new ParsedIdiom(item, parseQuietly(item, IdiomPayload.class)))
            .filter(entry -> entry.payload() != null)
            .toList();
    return (int)
        idioms.stream()
            .filter(
                source ->
                    idioms.stream()
                        .anyMatch(
                            successor ->
                                !successor.item().id().equals(source.item().id())
                                    && source
                                        .payload()
                                        .tailPinyin()
                                        .equals(successor.payload().headPinyin())))
            .count();
  }

  private <T> T parse(
      ContentItemView item, Class<T> payloadType, List<ContentIssue> issues) {
    try {
      return objectMapper.treeToValue(item.payload(), payloadType);
    } catch (JsonProcessingException | IllegalArgumentException error) {
      issues.add(invalid(item.id(), "/payload", "payload does not match content type"));
      return null;
    }
  }

  private <T> T parseQuietly(ContentItemView item, Class<T> payloadType) {
    try {
      return objectMapper.treeToValue(item.payload(), payloadType);
    } catch (JsonProcessingException | IllegalArgumentException error) {
      return null;
    }
  }

  private static ContentIssue invalid(String itemId, String path, String message) {
    return new ContentIssue(ContentIssueCode.CONTENT_FIELD_INVALID, itemId, path, message);
  }

  private static boolean isToneFreePinyin(String value) {
    return value != null && TONE_FREE_PINYIN.matcher(value).matches();
  }

  private static boolean isBlank(String value) {
    return value == null || value.isBlank();
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record CharacterPayload(
      @JsonProperty("char") String character, String pinyin) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record PoemPayload(
      String title, String author, List<String> lines, List<String> charRefs) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record IdiomPayload(
      String text, String meaning, String headPinyin, String tailPinyin) {}

  private record ParsedIdiom(ContentItemView item, IdiomPayload payload) {}
}
