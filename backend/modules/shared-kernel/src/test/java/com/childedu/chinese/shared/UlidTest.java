package com.childedu.chinese.shared;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class UlidTest {

  @Test
  void acceptsValid26CharCrockfordBase32() {
    assertThat(Ulid.isValid("01ARZ3NDEKTSV4RRFFQ69G5FAV")).isTrue();
  }

  @Test
  void rejectsWrongLength() {
    assertThat(Ulid.isValid("01ARZ3NDEK")).isFalse();
  }

  @Test
  void rejectsIllegalCrockfordChars() {
    // Crockford Base32 排除 I L O U
    assertThat(Ulid.isValid("01ARZ3NDEKTSV4RRFFQ69G5FIL")).isFalse();
  }

  @Test
  void lexicalOrderMatchesGenerationOrder() {
    String earlier = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    String later = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
    assertThat(Ulid.compareLexical(earlier, later)).isNegative();
  }

  @Test
  void valueRecordsWrapRawStrings() {
    assertThat(new PrincipalId("p1").value()).isEqualTo("p1");
    assertThat(new ChildProfileId("c1").value()).isEqualTo("c1");
    assertThat(new ContentVersion("2026.01").value()).isEqualTo("2026.01");
    assertThat(new RuleVersion("mastery-v1").value()).isEqualTo("mastery-v1");
  }
}
