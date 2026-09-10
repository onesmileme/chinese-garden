package com.childedu.chinese.identity.application;

import com.childedu.chinese.shared.PrincipalId;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.function.Supplier;
import javax.crypto.SecretKey;

/** 令牌签发/校验/轮换。Access 2h、Refresh 30d（spec §21）。 */
public class TokenService {

  public static final Duration ACCESS_TTL = Duration.ofHours(2);
  public static final Duration REFRESH_TTL = Duration.ofDays(30);

  private final SecretKey key;
  private final Supplier<Instant> clock;

  public TokenService(byte[] secret, Supplier<Instant> clock) {
    this.key = Keys.hmacShaKeyFor(secret);
    this.clock = clock;
  }

  public String issueAccess(PrincipalId principal) {
    Instant now = clock.get();
    return Jwts.builder()
        .subject(principal.value())
        .claim("typ", "access")
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plus(ACCESS_TTL)))
        .signWith(key)
        .compact();
  }

  public String issueRefresh(PrincipalId principal, String jti) {
    Instant now = clock.get();
    return Jwts.builder()
        .subject(principal.value())
        .id(jti)
        .claim("typ", "refresh")
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plus(REFRESH_TTL)))
        .signWith(key)
        .compact();
  }

  public PrincipalId principalOfAccess(String token) {
    Claims claims = parse(token);
    requireType(claims, "access");
    return new PrincipalId(claims.getSubject());
  }

  public RefreshClaims requireRefresh(String token) {
    Claims claims = parse(token);
    requireType(claims, "refresh");
    String jti = claims.getId();
    if (jti == null || jti.isBlank()) {
      throw new IllegalArgumentException("refresh token jti missing");
    }
    return new RefreshClaims(
        new PrincipalId(claims.getSubject()), jti, claims.getExpiration().toInstant());
  }

  /** @deprecated use the token-type-specific methods. */
  @Deprecated
  public PrincipalId principalOf(String token) {
    return principalOfAccess(token);
  }

  public Instant expiryOf(String token) {
    return parse(token).getExpiration().toInstant();
  }

  public String refreshJti(String token) {
    return requireRefresh(token).jti();
  }

  private static void requireType(Claims claims, String expected) {
    String actual = claims.get("typ", String.class);
    if (!expected.equals(actual)) {
      throw new IllegalArgumentException("unexpected token type: " + actual);
    }
  }

  private Claims parse(String token) {
    try {
      return Jwts.parser()
          .clock(() -> Date.from(clock.get()))
          .verifyWith(key)
          .build()
          .parseSignedClaims(token)
          .getPayload();
    } catch (JwtException | IllegalArgumentException e) {
      throw new IllegalArgumentException("invalid token", e);
    }
  }
}
