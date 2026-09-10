package com.childedu.chinese.content.infrastructure;

import com.childedu.chinese.content.domain.ContentLevelRules;
import com.childedu.chinese.content.domain.MasteryRules;
import com.childedu.chinese.content.domain.ProgressionRules;
import com.childedu.chinese.content.domain.RuleSet;
import com.childedu.chinese.shared.RuleVersion;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;

/** 从 frontend/content/rules/*.json 读取版本化规则（与 TS 端同一批文件）。 */
public class RuleSetLoader {

  private final Path contentRoot; // 指向 frontend/content
  private final ObjectMapper mapper = new ObjectMapper();

  public RuleSetLoader(Path contentRoot) {
    this.contentRoot = contentRoot;
  }

  public RuleSet load(RuleVersion masteryVersion, RuleVersion progressionVersion) {
    MasteryRules mastery = loadMastery(masteryVersion);
    ProgressionRules progression = loadProgression(progressionVersion);
    return new RuleSet(masteryVersion, progressionVersion, mastery, progression);
  }

  public RuleSet load(
      RuleVersion masteryVersion,
      RuleVersion progressionVersion,
      RuleVersion contentLevelVersion) {
    return new RuleSet(
        masteryVersion,
        progressionVersion,
        contentLevelVersion,
        loadMastery(masteryVersion),
        loadProgression(progressionVersion),
        loadContentLevel(contentLevelVersion));
  }

  public ContentLevelRules loadContentLevel(RuleVersion version) {
    JsonNode node = read("rules/" + version.value() + ".json");
    try {
      ContentLevelRules rules = mapper.treeToValue(node, ContentLevelRules.class);
      if (!version.value().equals(rules.ruleVersion())) {
        throw new IllegalArgumentException(
            "content level rule version mismatch: expected "
                + version.value()
                + " but was "
                + rules.ruleVersion());
      }
      return rules;
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException(
          "invalid content level rules: " + version.value(), e);
    }
  }

  private MasteryRules loadMastery(RuleVersion v) {
    JsonNode n = read("rules/" + v.value() + ".json");
    JsonNode caps = n.get("evidenceCaps");
    JsonNode th = n.get("statusThresholds");
    return new MasteryRules(
        caps.get("firstLearn").asInt(),
        caps.get("consolidation").asInt(),
        caps.get("checkpoint").asInt(),
        caps.get("delayedReview").asInt(),
        n.get("guidedPoints").asInt(),
        th.get("practicing").asInt(),
        th.get("mastered").asInt(),
        th.get("stable").asInt(),
        n.get("checkpointPassCorrect").asInt());
  }

  private ProgressionRules loadProgression(RuleVersion v) {
    JsonNode n = read("rules/" + v.value() + ".json");
    JsonNode bonus = n.get("accuracyBonus");
    return new ProgressionRules(
        n.get("maxLevel").asInt(),
        n.get("baseXpPerLevel").asInt(),
        n.get("xpStepPerLevel").asInt(),
        bonus.get("full").asInt(),
        bonus.get("high").asInt(),
        bonus.get("highThreshold").asDouble(),
        n.get("weeklyGoalDays").asInt());
  }

  private JsonNode read(String relative) {
    try {
      return mapper.readTree(contentRoot.resolve(relative).toFile());
    } catch (IOException e) {
      throw new UncheckedIOException("cannot read rule file: " + relative, e);
    }
  }
}
