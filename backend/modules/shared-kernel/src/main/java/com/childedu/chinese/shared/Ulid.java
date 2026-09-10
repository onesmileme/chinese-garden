package com.childedu.chinese.shared;

/** 客户端生成的 ULID，后端只做校验与字典序比较（不重新生成）。 */
public final class Ulid {

  private static final String CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

  private Ulid() {}

  public static boolean isValid(String s) {
    if (s == null || s.length() != 26) {
      return false;
    }
    String upper = s.toUpperCase();
    for (int i = 0; i < upper.length(); i++) {
      if (CROCKFORD.indexOf(upper.charAt(i)) < 0) {
        return false;
      }
    }
    return true;
  }

  /** ULID 前 48 位为时间戳，字典序即生成序。 */
  public static int compareLexical(String a, String b) {
    return a.compareTo(b);
  }
}
