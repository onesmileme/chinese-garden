package com.childedu.chinese.identity.api;

public record RefreshRequest(String refreshToken) {
  public RefreshRequest {
    if (refreshToken == null || refreshToken.isBlank()) {
      throw new IllegalArgumentException("refreshToken must not be blank");
    }
  }
}
