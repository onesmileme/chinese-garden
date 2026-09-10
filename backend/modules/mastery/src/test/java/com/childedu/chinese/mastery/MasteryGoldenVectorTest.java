package com.childedu.chinese.mastery;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.content.domain.RuleSet;
import com.childedu.chinese.content.infrastructure.RuleSetLoader;
import com.childedu.chinese.mastery.domain.DelayedReviewSession;
import com.childedu.chinese.mastery.domain.MasteryEngine;
import com.childedu.chinese.mastery.domain.MasteryEvidence;
import com.childedu.chinese.mastery.domain.MasterySnapshot;
import com.childedu.chinese.shared.RuleVersion;
import com.childedu.chinese.testsupport.GoldenVectors;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class MasteryGoldenVectorTest {

  @Test
  void matchesEveryMasteryVector() {
    JsonNode root = GoldenVectors.readVector("mastery.json");
    RuleVersion rv = new RuleVersion(root.get("ruleVersion").asText());
    RuleSet ruleSet =
        new RuleSetLoader(GoldenVectors.contentRoot()).load(rv, new RuleVersion("progression-v1"));
    MasteryEngine engine = new MasteryEngine(ruleSet.mastery());

    for (JsonNode c : root.get("cases")) {
      JsonNode in = c.get("input");
      List<Boolean> consolidation = new ArrayList<>();
      in.get("consolidationOutcomes").forEach(n -> consolidation.add(n.asBoolean()));
      List<DelayedReviewSession> sessions = new ArrayList<>();
      in.get("delayedReviewSessions")
          .forEach(
              n ->
                  sessions.add(
                      new DelayedReviewSession(n.get("firstCorrect").asInt(), n.get("total").asInt())));

      MasteryEvidence evidence =
          new MasteryEvidence(
              in.get("guidedCompleted").asBoolean(),
              in.get("firstLearnFirstCorrect").asInt(),
              in.get("firstLearnTotal").asInt(),
              consolidation,
              in.get("checkpointFirstCorrect").asInt(),
              sessions,
              in.get("delayedReviewFailing").asBoolean());

      MasterySnapshot actual = engine.compute(evidence);
      JsonNode exp = c.get("expected");
      assertThat(actual.score())
          .as("case %s score", c.get("name").asText())
          .isEqualTo(exp.get("score").asInt());
      assertThat(actual.status().name())
          .as("case %s status", c.get("name").asText())
          .isEqualTo(exp.get("status").asText());
    }
  }
}
