package com.childedu.chinese.identity.api;

import com.childedu.chinese.identity.application.AuthResult;

public record AuthResponse(
    String accessToken, String refreshToken, String principalId, String defaultChildId) {

  public static AuthResponse from(AuthResult result) {
    return new AuthResponse(
        result.accessToken(),
        result.refreshToken(),
        result.principalId().value(),
        result.defaultChildId().value());
  }
}
