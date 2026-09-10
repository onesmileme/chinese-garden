package com.childedu.chinese.identity.application;

import com.childedu.chinese.shared.PrincipalId;
import java.time.Instant;

public interface RefreshSessionRepository {

  void create(String jtiDigest, PrincipalId principalId, Instant expiresAt, Instant now);

  boolean rotate(
      String oldJtiDigest,
      PrincipalId principalId,
      String newJtiDigest,
      Instant newExpiresAt,
      Instant now);
}
