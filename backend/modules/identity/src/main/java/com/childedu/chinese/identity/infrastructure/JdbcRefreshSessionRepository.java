package com.childedu.chinese.identity.infrastructure;

import com.childedu.chinese.identity.application.RefreshSessionRepository;
import com.childedu.chinese.shared.PrincipalId;
import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

public final class JdbcRefreshSessionRepository implements RefreshSessionRepository {

  private final JdbcTemplate jdbc;
  private final TransactionTemplate transactions;

  public JdbcRefreshSessionRepository(JdbcTemplate jdbc, TransactionTemplate transactions) {
    this.jdbc = jdbc;
    this.transactions = transactions;
  }

  @Override
  public void create(
      String jtiDigest, PrincipalId principalId, Instant expiresAt, Instant now) {
    jdbc.update(
        """
        INSERT INTO refresh_session
          (jti_sha256, principal_id, expires_at, revoked_at, created_at)
        VALUES (?, ?, ?, NULL, ?)
        """,
        jtiDigest,
        principalId.value(),
        Timestamp.from(expiresAt),
        Timestamp.from(now));
  }

  @Override
  public boolean rotate(
      String oldJtiDigest,
      PrincipalId principalId,
      String newJtiDigest,
      Instant newExpiresAt,
      Instant now) {
    Boolean rotated =
        transactions.execute(
            status -> {
              int revoked =
                  jdbc.update(
                      """
                      UPDATE refresh_session
                      SET revoked_at = ?
                      WHERE jti_sha256 = ?
                        AND principal_id = ?
                        AND revoked_at IS NULL
                        AND expires_at > ?
                      """,
                      Timestamp.from(now),
                      oldJtiDigest,
                      principalId.value(),
                      Timestamp.from(now));
              if (revoked != 1) {
                return false;
              }
              create(newJtiDigest, principalId, newExpiresAt, now);
              return true;
            });
    return Boolean.TRUE.equals(rotated);
  }
}
