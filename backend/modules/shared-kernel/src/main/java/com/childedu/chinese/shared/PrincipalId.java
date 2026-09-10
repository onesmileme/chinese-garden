package com.childedu.chinese.shared;

public record PrincipalId(String value) {
  public PrincipalId {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException("principalId blank");
    }
  }
}
