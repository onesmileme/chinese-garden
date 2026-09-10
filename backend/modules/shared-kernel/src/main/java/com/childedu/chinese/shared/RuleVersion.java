package com.childedu.chinese.shared;

public record RuleVersion(String value) {
  public RuleVersion {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException("ruleVersion blank");
    }
  }
}
