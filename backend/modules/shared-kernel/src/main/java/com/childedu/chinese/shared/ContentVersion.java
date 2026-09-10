package com.childedu.chinese.shared;

public record ContentVersion(String value) {
  public ContentVersion {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException("contentVersion blank");
    }
  }
}
