package com.childedu.chinese.identity.api;

import com.childedu.chinese.identity.application.IdentityService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/auth")
public final class AuthController {

  private final IdentityService identities;

  public AuthController(IdentityService identities) {
    this.identities = identities;
  }

  @PostMapping("/platform-login")
  public AuthResponse platformLogin(@RequestBody PlatformLoginRequest request) {
    return AuthResponse.from(identities.platformLogin(request.toCommand()));
  }

  @PostMapping("/refresh")
  public AuthResponse refresh(@RequestBody RefreshRequest request) {
    return AuthResponse.from(identities.refresh(request.refreshToken()));
  }
}
