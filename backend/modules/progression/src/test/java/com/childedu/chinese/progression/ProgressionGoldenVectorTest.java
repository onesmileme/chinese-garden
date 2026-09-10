package com.childedu.chinese.progression;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.content.domain.RuleSet;
import com.childedu.chinese.content.infrastructure.RuleSetLoader;
import com.childedu.chinese.progression.domain.ProgressionEngine;
import com.childedu.chinese.progression.domain.ProgressionState;
import com.childedu.chinese.progression.domain.XpEvent;
import com.childedu.chinese.shared.RuleVersion;
import com.childedu.chinese.testsupport.GoldenVectors;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class ProgressionGoldenVectorTest {

  @Test
  void matchesEveryProgressionVector() {
    JsonNode root = GoldenVectors.readVector("progression.json");
    RuleVersion rv = new RuleVersion(root.get("ruleVersion").asText());
    RuleSet ruleSet =
        new RuleSetLoader(GoldenVectors.contentRoot()).load(new RuleVersion("mastery-v1"), rv);
    ProgressionEngine engine = new ProgressionEngine(ruleSet.progression());

    for (JsonNode c : root.get("cases")) {
      JsonNode init = c.get("initial");
      List<String> applied = new ArrayList<>();
      init.get("appliedEventIds").forEach(n -> applied.add(n.asText()));
      ProgressionState state =
          new ProgressionState(
              init.get("level").asInt(),
              init.get("lifetimeXp").asLong(),
              init.get("xpIntoLevel").asInt(),
              applied);

      List<XpEvent> events = new ArrayList<>();
      c.get("events")
          .forEach(n -> events.add(new XpEvent(n.get("eventId").asText(), n.get("xp").asInt())));

      ProgressionState actual = engine.settle(state, events);
      JsonNode exp = c.get("expected");
      assertThat(actual.level())
          .as("case %s level", c.get("name").asText())
          .isEqualTo(exp.get("level").asInt());
      assertThat(actual.lifetimeXp())
          .as("case %s lifetimeXp", c.get("name").asText())
          .isEqualTo(exp.get("lifetimeXp").asLong());
      assertThat(actual.xpIntoLevel())
          .as("case %s xpIntoLevel", c.get("name").asText())
          .isEqualTo(exp.get("xpIntoLevel").asInt());
    }
  }
}
