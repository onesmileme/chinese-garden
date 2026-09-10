package com.childedu.chinese.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.childedu.chinese.identity.application.AuthResult;
import com.childedu.chinese.identity.application.IdGenerator;
import com.childedu.chinese.identity.application.IdentityRepository;
import com.childedu.chinese.identity.application.IdentityService;
import com.childedu.chinese.identity.application.InvalidRefreshToken;
import com.childedu.chinese.identity.application.PlatformLoginCommand;
import com.childedu.chinese.identity.application.PrincipalAccount;
import com.childedu.chinese.identity.application.RefreshSessionRepository;
import com.childedu.chinese.identity.application.TokenService;
import com.childedu.chinese.identity.domain.Platform;
import com.childedu.chinese.identity.domain.PlatformGateway;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.shared.PrincipalId;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class IdentityServiceTest {

  private static final Instant NOW = Instant.parse("2026-08-29T00:00:00Z");
  private static final byte[] SECRET = "0123456789abcdef0123456789abcdef".getBytes();

  @Test
  void firstLoginCreatesAStablePrincipalAndDefaultChild() {
    FakeIdentityRepository identities = new FakeIdentityRepository();
    FakeRefreshSessions sessions = new FakeRefreshSessions();
    IdentityService service = service(identities, sessions);

    AuthResult first =
        service.platformLogin(new PlatformLoginCommand(Platform.WECHAT, "wx-app", "code-1"));
    AuthResult second =
        service.platformLogin(new PlatformLoginCommand(Platform.WECHAT, "wx-app", "code-1"));

    assertThat(first.principalId()).isEqualTo(new PrincipalId("principal-1"));
    assertThat(first.defaultChildId()).isEqualTo(new ChildProfileId("child-1"));
    assertThat(second.principalId()).isEqualTo(first.principalId());
    assertThat(second.defaultChildId()).isEqualTo(first.defaultChildId());
    assertThat(identities.created).isEqualTo(1);
    assertThat(sessions.active).hasSize(2);
  }

  @Test
  void refreshRotatesOnceAndRejectsReplay() {
    FakeIdentityRepository identities = new FakeIdentityRepository();
    FakeRefreshSessions sessions = new FakeRefreshSessions();
    IdentityService service = service(identities, sessions);
    AuthResult login =
        service.platformLogin(new PlatformLoginCommand(Platform.WECHAT, "wx-app", "code-1"));

    AuthResult refreshed = service.refresh(login.refreshToken());

    assertThat(refreshed.refreshToken()).isNotEqualTo(login.refreshToken());
    assertThat(refreshed.defaultChildId()).isEqualTo(login.defaultChildId());
    assertThatThrownBy(() -> service.refresh(login.refreshToken()))
        .isInstanceOf(InvalidRefreshToken.class);
  }

  private static IdentityService service(
      FakeIdentityRepository identities, FakeRefreshSessions sessions) {
    PlatformGateway platform = (appId, code) -> "openid-" + code;
    ArrayDeque<String> ids =
        new ArrayDeque<>(
            java.util.List.of(
                "principal-1", "child-1", "refresh-1", "refresh-2", "refresh-3"));
    IdGenerator idGenerator = ids::removeFirst;
    return new IdentityService(
        Map.of(Platform.WECHAT, platform),
        identities,
        sessions,
        new TokenService(SECRET, () -> NOW),
        idGenerator,
        Clock.fixed(NOW, ZoneOffset.UTC));
  }

  private static final class FakeIdentityRepository implements IdentityRepository {
    private final Map<String, PrincipalAccount> accounts = new HashMap<>();
    private int created;

    @Override
    public Optional<PrincipalAccount> find(
        Platform platform, String platformAppId, String externalUserId) {
      return Optional.ofNullable(accounts.get(platform + ":" + platformAppId + ":" + externalUserId));
    }

    @Override
    public PrincipalAccount createPrincipalWithDefaultChild(
        PrincipalId principalId,
        Platform platform,
        String platformAppId,
        String externalUserId,
        ChildProfileId childId,
        Instant now) {
      PrincipalAccount account = new PrincipalAccount(principalId, childId, true);
      accounts.put(platform + ":" + platformAppId + ":" + externalUserId, account);
      created += 1;
      return account;
    }

    @Override
    public ChildProfileId requireDefaultChild(PrincipalId principalId) {
      return accounts.values().stream()
          .filter(account -> account.principalId().equals(principalId))
          .findFirst()
          .orElseThrow()
          .defaultChildId();
    }

    @Override
    public boolean canAccess(PrincipalId principalId, ChildProfileId childId) {
      return accounts.values().stream()
          .anyMatch(
              account ->
                  account.principalId().equals(principalId)
                      && account.defaultChildId().equals(childId));
    }

    @Override
    public boolean isActive(PrincipalId principalId) {
      return accounts.values().stream()
          .anyMatch(account -> account.principalId().equals(principalId) && account.active());
    }
  }

  private static final class FakeRefreshSessions implements RefreshSessionRepository {
    private final Map<String, PrincipalId> active = new HashMap<>();

    @Override
    public void create(
        String jtiDigest, PrincipalId principalId, Instant expiresAt, Instant now) {
      active.put(jtiDigest, principalId);
    }

    @Override
    public boolean rotate(
        String oldJtiDigest,
        PrincipalId principalId,
        String newJtiDigest,
        Instant newExpiresAt,
        Instant now) {
      if (!principalId.equals(active.remove(oldJtiDigest))) {
        return false;
      }
      active.put(newJtiDigest, principalId);
      return true;
    }
  }
}
