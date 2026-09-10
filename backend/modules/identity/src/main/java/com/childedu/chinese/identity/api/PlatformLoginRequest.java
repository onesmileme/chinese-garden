package com.childedu.chinese.identity.api;

import com.childedu.chinese.identity.application.PlatformLoginCommand;
import com.childedu.chinese.identity.domain.Platform;

public record PlatformLoginRequest(Platform platform, String platformAppId, String code) {

  public PlatformLoginCommand toCommand() {
    if (platform == null
        || platformAppId == null
        || platformAppId.isBlank()
        || code == null
        || code.isBlank()) {
      throw new IllegalArgumentException("platform login fields must not be blank");
    }
    return new PlatformLoginCommand(platform, platformAppId, code);
  }
}
