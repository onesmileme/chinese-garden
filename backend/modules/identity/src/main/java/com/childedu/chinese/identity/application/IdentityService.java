package com.childedu.chinese.identity.application;

import com.childedu.chinese.identity.domain.Platform;
import com.childedu.chinese.identity.domain.PlatformGateway;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.shared.PrincipalId;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;

public final class IdentityService {

  private final Map<Platform, PlatformGateway> gateways;
  private final IdentityRepository identities;
  private final RefreshSessionRepository refreshSessions;
  private final TokenService tokens;
  private final IdGenerator ids;
  private final Clock clock;

  public IdentityService(
      Map<Platform, PlatformGateway> gateways,
      IdentityRepository identities,
      RefreshSessionRepository refreshSessions,
      TokenService tokens,
      IdGenerator ids,
      Clock clock) {
    this.gateways = Map.copyOf(gateways);
    this.identities = Objects.requireNonNull(identities, "identity repository");
    this.refreshSessions = Objects.requireNonNull(refreshSessions, "refresh session repository");
    this.tokens = Objects.requireNonNull(tokens, "token service");
    this.ids = Objects.requireNonNull(ids, "id generator");
    this.clock = Objects.requireNonNull(clock, "clock");
  }

  public AuthResult platformLogin(PlatformLoginCommand command) {
    if (command == null
        || command.platform() == null
        || blank(command.platformAppId())
        || blank(command.code())) {
      throw new IllegalArgumentException("platform login fields must not be blank");
    }
    PlatformGateway gateway = gateways.get(command.platform());
    if (gateway == null) {
      throw new IllegalArgumentException("unsupported platform: " + command.platform());
    }
    String externalUserId =
        gateway.exchangeExternalUserId(command.platformAppId(), command.code());
    PrincipalAccount account =
        identities
            .find(command.platform(), command.platformAppId(), externalUserId)
            .orElseGet(
                () ->
                    identities.createPrincipalWithDefaultChild(
                        new PrincipalId(ids.next()),
                        command.platform(),
                        command.platformAppId(),
                        externalUserId,
                        new ChildProfileId(ids.next()),
                        Instant.now(clock)));
    if (!account.active()) {
      throw new SecurityException("principal disabled");
    }
    return issue(account.principalId(), account.defaultChildId());
  }

  public AuthResult refresh(String refreshToken) {
    try {
      RefreshClaims claims = tokens.requireRefresh(refreshToken);
      if (!identities.isActive(claims.principalId())) {
        throw new InvalidRefreshToken("principal disabled");
      }
      String nextJti = ids.next();
      String nextRefresh = tokens.issueRefresh(claims.principalId(), nextJti);
      boolean rotated =
          refreshSessions.rotate(
              sha256(claims.jti()),
              claims.principalId(),
              sha256(nextJti),
              tokens.expiryOf(nextRefresh),
              Instant.now(clock));
      if (!rotated) {
        throw new InvalidRefreshToken("refresh token already used");
      }
      return new AuthResult(
          tokens.issueAccess(claims.principalId()),
          nextRefresh,
          claims.principalId(),
          identities.requireDefaultChild(claims.principalId()));
    } catch (InvalidRefreshToken error) {
      throw error;
    } catch (IllegalArgumentException error) {
      throw new InvalidRefreshToken("invalid refresh token", error);
    }
  }

  private AuthResult issue(PrincipalId principalId, ChildProfileId childId) {
    String jti = ids.next();
    String refresh = tokens.issueRefresh(principalId, jti);
    refreshSessions.create(
        sha256(jti), principalId, tokens.expiryOf(refresh), Instant.now(clock));
    return new AuthResult(tokens.issueAccess(principalId), refresh, principalId, childId);
  }

  private static String sha256(String value) {
    try {
      byte[] bytes =
          MessageDigest.getInstance("SHA-256")
              .digest(value.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(bytes);
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("SHA-256 unavailable", impossible);
    }
  }

  private static boolean blank(String value) {
    return value == null || value.isBlank();
  }
}
