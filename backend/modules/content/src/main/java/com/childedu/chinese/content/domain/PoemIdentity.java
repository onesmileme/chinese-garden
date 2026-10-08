package com.childedu.chinese.content.domain;

import java.text.Normalizer;
import java.util.List;
import java.util.Objects;

public final class PoemIdentity {

  private PoemIdentity() {}

  public static String of(String author, List<String> lines) {
    Objects.requireNonNull(lines, "poem lines");
    return normalize(author) + '\0' + normalize(String.join("", lines));
  }

  public static String normalize(String value) {
    String normalized =
        Normalizer.normalize(Objects.requireNonNull(value, "poem text"), Normalizer.Form.NFKC);
    StringBuilder result = new StringBuilder(normalized.length());
    normalized.codePoints().filter(codePoint -> !ignored(codePoint)).forEach(result::appendCodePoint);
    return result.toString();
  }

  private static boolean ignored(int codePoint) {
    return isUnicodeWhiteSpace(codePoint) || isUnicodePunctuation(codePoint);
  }

  private static boolean isUnicodeWhiteSpace(int codePoint) {
    return switch (codePoint) {
      case 0x0009,
          0x000A,
          0x000B,
          0x000C,
          0x000D,
          0x0020,
          0x0085,
          0x00A0,
          0x1680,
          0x2028,
          0x2029,
          0x202F,
          0x205F,
          0x3000 ->
          true;
      default -> codePoint >= 0x2000 && codePoint <= 0x200A;
    };
  }

  private static boolean isUnicodePunctuation(int codePoint) {
    return switch (java.lang.Character.getType(codePoint)) {
      case java.lang.Character.CONNECTOR_PUNCTUATION,
          java.lang.Character.DASH_PUNCTUATION,
          java.lang.Character.START_PUNCTUATION,
          java.lang.Character.END_PUNCTUATION,
          java.lang.Character.INITIAL_QUOTE_PUNCTUATION,
          java.lang.Character.FINAL_QUOTE_PUNCTUATION,
          java.lang.Character.OTHER_PUNCTUATION ->
          true;
      default -> false;
    };
  }
}
