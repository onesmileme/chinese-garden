package com.childedu.chinese.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.childedu.chinese.content.domain.Character;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.Idiom;
import com.childedu.chinese.content.domain.Poem;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class ContentMetadataValidationTest {

  @Test
  void rejectsMetadataOutsideTheSharedTypeScriptContract() {
    assertThatThrownBy(() -> character(0, 1, ContentStatus.ACTIVE, List.of(), 1))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("1..5");
    assertThatThrownBy(() -> character(1, 6, ContentStatus.ACTIVE, List.of(), 1))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("1..5");
    assertThatThrownBy(() -> character(1, 1, null, List.of(), 1))
        .isInstanceOf(NullPointerException.class)
        .hasMessageContaining("status");
    assertThatThrownBy(() -> character(1, 1, ContentStatus.ACTIVE, null, 1))
        .isInstanceOf(NullPointerException.class)
        .hasMessageContaining("tags");
    assertThatThrownBy(() -> character(1, 1, ContentStatus.ACTIVE, List.of(" "), 1))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("non-blank");
    assertThatThrownBy(
            () ->
                new Poem(
                    "sc-test",
                    "测试",
                    "佚名",
                    List.of("山"),
                    List.of("hz-shan-山"),
                    1,
                    1,
                    true,
                    ContentStatus.ACTIVE,
                    List.of(),
                    0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("positive");
    assertThatThrownBy(
            () ->
                new Idiom(
                    "cy-test",
                    "一心一意",
                    "专心",
                    "yi",
                    "yi",
                    1,
                    1,
                    true,
                    ContentStatus.ACTIVE,
                    List.of(""),
                    1))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("non-blank");
  }

  @Test
  void defensivelyCopiesTags() {
    List<String> tags = new ArrayList<>(List.of("基础"));
    Character character = character(1, 1, ContentStatus.ACTIVE, tags, 1);

    tags.add("变更");

    assertThat(character.tags()).containsExactly("基础");
    assertThatThrownBy(() -> character.tags().add("非法"))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  private static Character character(
      int level, int difficulty, ContentStatus status, List<String> tags, int revision) {
    return new Character(
        "hz-shan-山",
        "山",
        "shān",
        "img-shan",
        "nature",
        3,
        difficulty,
        level,
        true,
        status,
        tags,
        revision);
  }
}
