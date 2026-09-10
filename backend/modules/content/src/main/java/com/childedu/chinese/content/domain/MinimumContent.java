package com.childedu.chinese.content.domain;

public record MinimumContent(int characters, int poems, int chainableIdioms) {

  public MinimumContent {
    if (characters < 0 || poems < 0 || chainableIdioms < 0) {
      throw new IllegalArgumentException("minimum content counts must not be negative");
    }
  }
}
