package com.childedu.chinese.shared;

public record ChildProfileId(String value) {
  public ChildProfileId {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException("childProfileId blank");
    }
  }
}
