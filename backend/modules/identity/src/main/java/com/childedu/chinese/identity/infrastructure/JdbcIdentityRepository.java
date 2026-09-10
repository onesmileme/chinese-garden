package com.childedu.chinese.identity.infrastructure;

import com.childedu.chinese.identity.application.IdentityRepository;
import com.childedu.chinese.identity.application.PrincipalAccount;
import com.childedu.chinese.identity.domain.Platform;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.shared.PrincipalId;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

public final class JdbcIdentityRepository implements IdentityRepository {

  private final JdbcTemplate jdbc;
  private final TransactionTemplate transactions;

  public JdbcIdentityRepository(JdbcTemplate jdbc, TransactionTemplate transactions) {
    this.jdbc = jdbc;
    this.transactions = transactions;
  }

  @Override
  public Optional<PrincipalAccount> find(
      Platform platform, String platformAppId, String externalUserId) {
    return jdbc
        .query(
            """
            SELECT p.id, p.status, pc.child_profile_id
            FROM external_identity e
            JOIN principal p ON p.id = e.principal_id
            JOIN principal_child pc ON pc.principal_id = p.id
            WHERE e.platform = ? AND e.platform_app_id = ? AND e.external_user_id = ?
            ORDER BY pc.created_at, pc.child_profile_id
            LIMIT 1
            """,
            (rs, row) ->
                new PrincipalAccount(
                    new PrincipalId(rs.getString("id")),
                    new ChildProfileId(rs.getString("child_profile_id")),
                    "ACTIVE".equals(rs.getString("status"))),
            platform.name(),
            platformAppId,
            externalUserId)
        .stream()
        .findFirst();
  }

  @Override
  public PrincipalAccount createPrincipalWithDefaultChild(
      PrincipalId principalId,
      Platform platform,
      String platformAppId,
      String externalUserId,
      ChildProfileId childId,
      Instant now) {
    try {
      PrincipalAccount created =
          transactions.execute(
              status -> {
                Timestamp timestamp = Timestamp.from(now);
                jdbc.update(
                    "INSERT INTO principal (id, status, created_at) VALUES (?, 'ACTIVE', ?)",
                    principalId.value(),
                    timestamp);
                jdbc.update(
                    """
                    INSERT INTO external_identity
                      (principal_id, platform, platform_app_id, external_user_id, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    principalId.value(),
                    platform.name(),
                    platformAppId,
                    externalUserId,
                    timestamp);
                jdbc.update(
                    """
                    INSERT INTO child_profile
                      (id, nickname, grade_band, birth_year_month, created_at)
                    VALUES (?, NULL, 'UNSPECIFIED', NULL, ?)
                    """,
                    childId.value(),
                    timestamp);
                jdbc.update(
                    """
                    INSERT INTO principal_child
                      (principal_id, child_profile_id, role, created_at)
                    VALUES (?, ?, 'GUARDIAN', ?)
                    """,
                    principalId.value(),
                    childId.value(),
                    timestamp);
                return new PrincipalAccount(principalId, childId, true);
              });
      if (created == null) {
        throw new IllegalStateException("identity transaction returned no account");
      }
      return created;
    } catch (DuplicateKeyException race) {
      return find(platform, platformAppId, externalUserId)
          .orElseGet(
              () ->
                  attachDefaultChild(
                      platform, platformAppId, externalUserId, childId, now, race));
    }
  }

  private PrincipalAccount attachDefaultChild(
      Platform platform,
      String platformAppId,
      String externalUserId,
      ChildProfileId childId,
      Instant now,
      DuplicateKeyException originalFailure) {
    PrincipalAccount account =
        transactions.execute(
            status -> {
              PrincipalRow principal =
                  jdbc.query(
                          """
                          SELECT p.id, p.status
                          FROM external_identity e
                          JOIN principal p ON p.id = e.principal_id
                          WHERE e.platform = ?
                            AND e.platform_app_id = ?
                            AND e.external_user_id = ?
                          FOR UPDATE
                          """,
                          (rs, row) ->
                              new PrincipalRow(
                                  new PrincipalId(rs.getString("id")),
                                  "ACTIVE".equals(rs.getString("status"))),
                          platform.name(),
                          platformAppId,
                          externalUserId)
                      .stream()
                      .findFirst()
                      .orElseThrow(() -> originalFailure);
              Optional<ChildProfileId> existingChild =
                  jdbc.query(
                          """
                          SELECT child_profile_id
                          FROM principal_child
                          WHERE principal_id = ?
                          ORDER BY created_at, child_profile_id
                          LIMIT 1
                          """,
                          (rs, row) ->
                              new ChildProfileId(rs.getString("child_profile_id")),
                          principal.id().value())
                      .stream()
                      .findFirst();
              if (existingChild.isPresent()) {
                return new PrincipalAccount(
                    principal.id(), existingChild.orElseThrow(), principal.active());
              }
              Timestamp timestamp = Timestamp.from(now);
              jdbc.update(
                  """
                  INSERT INTO child_profile
                    (id, nickname, grade_band, birth_year_month, created_at)
                  VALUES (?, NULL, 'UNSPECIFIED', NULL, ?)
                  """,
                  childId.value(),
                  timestamp);
              jdbc.update(
                  """
                  INSERT INTO principal_child
                    (principal_id, child_profile_id, role, created_at)
                  VALUES (?, ?, 'GUARDIAN', ?)
                  """,
                  principal.id().value(),
                  childId.value(),
                  timestamp);
              return new PrincipalAccount(principal.id(), childId, principal.active());
            });
    if (account == null) {
      throw new IllegalStateException("identity transaction returned no account");
    }
    return account;
  }

  @Override
  public ChildProfileId requireDefaultChild(PrincipalId principalId) {
    return jdbc
        .query(
            """
            SELECT child_profile_id
            FROM principal_child
            WHERE principal_id = ?
            ORDER BY created_at, child_profile_id
            LIMIT 1
            """,
            (rs, row) -> new ChildProfileId(rs.getString("child_profile_id")),
            principalId.value())
        .stream()
        .findFirst()
        .orElseThrow(() -> new IllegalStateException("principal has no child profile"));
  }

  @Override
  public boolean canAccess(PrincipalId principalId, ChildProfileId childId) {
    Integer count =
        jdbc.queryForObject(
            """
            SELECT COUNT(*)
            FROM principal_child
            WHERE principal_id = ? AND child_profile_id = ?
            """,
            Integer.class,
            principalId.value(),
            childId.value());
    return count != null && count == 1;
  }

  @Override
  public boolean isActive(PrincipalId principalId) {
    return jdbc
        .query(
            "SELECT status FROM principal WHERE id = ?",
            (rs, row) -> "ACTIVE".equals(rs.getString("status")),
            principalId.value())
        .stream()
        .findFirst()
        .orElse(false);
  }

  private record PrincipalRow(PrincipalId id, boolean active) {}
}
