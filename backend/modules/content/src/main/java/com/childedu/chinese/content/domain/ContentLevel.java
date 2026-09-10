package com.childedu.chinese.content.domain;

public enum ContentLevel {
  L1(1),
  L2(2),
  L3(3),
  L4(4),
  L5(5);

  private final int value;

  ContentLevel(int value) {
    this.value = value;
  }

  public int value() {
    return value;
  }

  public static ContentLevel fromValue(int value) {
    for (ContentLevel level : values()) {
      if (level.value == value) {
        return level;
      }
    }
    throw new IllegalArgumentException("content level must be in 1..5: " + value);
  }
}
