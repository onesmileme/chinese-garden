package com.childedu.chinese.app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.childedu.chinese.app.config.ClientSecurityConfig;
import com.childedu.chinese.identity.application.IdGenerator;
import com.childedu.chinese.identity.application.IdentityRepository;
import com.childedu.chinese.identity.application.IdentityService;
import com.childedu.chinese.identity.application.RefreshSessionRepository;
import com.childedu.chinese.identity.application.TokenService;
import java.time.Clock;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class ClientSecurityConfigTest {

  private final ClientSecurityConfig config = new ClientSecurityConfig();

  @Test
  void createsTokenServiceFromBase64Secret() {
    String secret =
        Base64.getEncoder()
            .encodeToString("0123456789abcdef0123456789abcdef".getBytes());

    assertThat(config.tokenService(secret, java.time.Clock.systemUTC()))
        .isInstanceOf(TokenService.class);
  }

  @Test
  void rejectsShortJwtSecret() {
    String secret = Base64.getEncoder().encodeToString("short".getBytes());

    assertThatThrownBy(() -> config.tokenService(secret, java.time.Clock.systemUTC()))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("32 bytes");
  }

  @Test
  void rejectsStartupWithoutAConfiguredPlatform() {
    assertThatThrownBy(() -> identityService("", "", "", ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("at least one login platform must be configured");
  }

  @Test
  void createsIdentityServiceWithOnlyDouyinConfigured() {
    assertThat(identityService("", "", "douyin-app", "douyin-secret"))
        .isInstanceOf(IdentityService.class);
  }

  private IdentityService identityService(
      String wechatAppId,
      String wechatSecret,
      String douyinAppId,
      String douyinSecret) {
    return config.identityService(
        mock(IdentityRepository.class),
        mock(RefreshSessionRepository.class),
        mock(TokenService.class),
        mock(IdGenerator.class),
        Clock.systemUTC(),
        "https://api.weixin.qq.com/",
        wechatAppId,
        wechatSecret,
        "https://developer.toutiao.com/",
        douyinAppId,
        douyinSecret);
  }
}
