package com.childedu.chinese.content;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.content.domain.RuleSet;
import com.childedu.chinese.content.infrastructure.RuleSetLoader;
import com.childedu.chinese.shared.RuleVersion;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RuleSetLoaderTest {

  @Test
  void loadsMasteryAndProgressionRulesFromJson(@TempDir Path dir) throws Exception {
    Path rules = Files.createDirectories(dir.resolve("rules"));
    Files.writeString(
        rules.resolve("mastery-v1.json"),
        """
        {"ruleVersion":"mastery-v1","evidenceCaps":{"firstLearn":40,"consolidation":25,
        "checkpoint":25,"delayedReview":10},"guidedPoints":20,
        "statusThresholds":{"practicing":40,"mastered":70,"stable":85},
        "checkpointPassCorrect":4}
        """);
    Files.writeString(
        rules.resolve("progression-v1.json"),
        """
        {"ruleVersion":"progression-v1","maxLevel":30,"baseXpPerLevel":100,
        "xpStepPerLevel":20,"accuracyBonus":{"full":10,"high":5,"highThreshold":0.9},
        "weeklyGoalDays":5}
        """);

    RuleSetLoader loader = new RuleSetLoader(dir);
    RuleSet set = loader.load(new RuleVersion("mastery-v1"), new RuleVersion("progression-v1"));

    assertThat(set.mastery().firstLearnCap()).isEqualTo(40);
    assertThat(set.mastery().guidedPoints()).isEqualTo(20);
    assertThat(set.mastery().stable()).isEqualTo(85);
    assertThat(set.progression().maxLevel()).isEqualTo(30);
    assertThat(set.progression().accuracyHighThreshold()).isEqualTo(0.9);
  }
}
