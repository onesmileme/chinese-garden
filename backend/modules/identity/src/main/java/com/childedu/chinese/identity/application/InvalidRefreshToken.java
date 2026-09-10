package com.childedu.chinese.identity.application;

public final class InvalidRefreshToken extends RuntimeException {
  public InvalidRefreshToken(String message) {
    super(message);
  }

  public InvalidRefreshToken(String message, Throwable cause) {
    super(message, cause);
  }
}
