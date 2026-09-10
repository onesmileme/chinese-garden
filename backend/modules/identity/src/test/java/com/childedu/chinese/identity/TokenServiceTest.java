package com.childedu.chinese.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.childedu.chinese.identity.application.TokenService;
import com.childedu.chinese.shared.PrincipalId;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class TokenServiceTest {

  static final byte[] SECRET =
      "0123456789abcdef0123456789abcdef".getBytes(); // 32 bytes for HS256

  @Test
  void accessTokenExpiresInTwoHours() {
    Instant now = Instant.parse("2026-07-17T00:00:00Z");
    TokenService svc = new TokenService(SECRET, () -> now);
    String access = svc.issueAccess(new PrincipalId("p1"));
    assertThat(svc.expiryOf(access)).isEqualTo(now.plus(Duration.ofHours(2)));
    assertThat(svc.principalOfAccess(access).value()).isEqualTo("p1");
  }

  @Test
  void refreshTokenExpiresInThirtyDaysAndRotates() {
    Instant now = Instant.parse("2026-07-17T00:00:00Z");
    TokenService svc = new TokenService(SECRET, () -> now);
    String refresh = svc.issueRefresh(new PrincipalId("p1"), "jti-1");
    assertThat(svc.expiryOf(refresh)).isEqualTo(now.plus(Duration.ofDays(30)));
    assertThat(svc.requireRefresh(refresh).jti()).isEqualTo("jti-1");
    assertThat(svc.requireRefresh(refresh).principalId().value()).isEqualTo("p1");
  }

  @Test
  void rejectsUsingRefreshAsAccessToken() {
    TokenService svc =
        new TokenService(SECRET, () -> Instant.parse("2026-07-17T00:00:00Z"));
    String refresh = svc.issueRefresh(new PrincipalId("p1"), "jti-1");

    assertThatThrownBy(() -> svc.principalOfAccess(refresh))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("token type");
  }

  @Test
  void rejectsUsingAccessAsRefreshToken() {
    TokenService svc =
        new TokenService(SECRET, () -> Instant.parse("2026-07-17T00:00:00Z"));
    String access = svc.issueAccess(new PrincipalId("p1"));

    assertThatThrownBy(() -> svc.requireRefresh(access))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("token type");
  }

  @Test
  void rejectsTamperedToken() {
    Instant now = Instant.parse("2026-07-17T00:00:00Z");
    TokenService svc = new TokenService(SECRET, () -> now);
    assertThatThrownBy(() -> svc.principalOfAccess("not.a.jwt"))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
