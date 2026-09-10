package com.childedu.chinese.content;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.content.api.ManifestResponse;
import com.childedu.chinese.content.application.AbilityLevelReader;
import com.childedu.chinese.content.application.LeveledManifestQuery;
import com.childedu.chinese.content.application.PublishedArtifactReader;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import com.childedu.chinese.shared.ChildProfileId;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class LeveledManifestQueryTest {

  @Test
  void resolvesTheArtifactForTheServerSideChildLevel() {
    AbilityLevelReader abilities = child -> Optional.of(ContentLevel.L3);
    PublishedArtifactReader artifacts =
        level -> Optional.of(artifact(level, "https://cdn.test/L3.tar.gz"));

    ManifestResponse response =
        new LeveledManifestQuery(abilities, artifacts)
            .forChild(new ChildProfileId("child-1"));

    assertThat(response.abilityLevel()).isEqualTo(3);
    assertThat(response.artifactUrl()).isEqualTo("https://cdn.test/L3.tar.gz");
    assertThat(response.format()).isEqualTo("tar+gzip");
  }

  @Test
  void defaultsMissingProgressionToL1() {
    AbilityLevelReader abilities = child -> Optional.empty();
    PublishedArtifactReader artifacts =
        level -> Optional.of(artifact(level, "https://cdn.test/L1.tar.gz"));

    ManifestResponse response =
        new LeveledManifestQuery(abilities, artifacts)
            .forChild(new ChildProfileId("child-1"));

    assertThat(response.abilityLevel()).isEqualTo(1);
  }

  private static ContentReleaseArtifact artifact(ContentLevel level, String url) {
    return new ContentReleaseArtifact(
        "corpus-v6",
        level,
        url,
        "a".repeat(64),
        1024,
        "tar+gzip",
        "mastery-v1",
        "progression-v1",
        "content-level-v1",
        "1.0.0");
  }
}
