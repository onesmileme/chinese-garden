package com.childedu.chinese.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.identity.application.PrincipalAccount;
import com.childedu.chinese.identity.domain.Platform;
import com.childedu.chinese.identity.infrastructure.JdbcIdentityRepository;
import com.childedu.chinese.identity.infrastructure.JdbcRefreshSessionRepository;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.shared.PrincipalId;
import com.childedu.chinese.testsupport.MigrationSupport;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import java.time.Instant;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

class JdbcIdentityRepositoryIT {

  private static JdbcTemplate jdbc;
  private static JdbcIdentityRepository identities;
  private static JdbcRefreshSessionRepository sessions;

  @BeforeAll
  static void migrate() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource();
    dataSource.setUrl(MySqlContainerSupport.jdbcUrl());
    dataSource.setUsername(MySqlContainerSupport.username());
    dataSource.setPassword(MySqlContainerSupport.password());
    Flyway.configure().dataSource(dataSource).locations(MigrationSupport.location()).load().migrate();
    jdbc = new JdbcTemplate(dataSource);
    TransactionTemplate transactions =
        new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    identities = new JdbcIdentityRepository(jdbc, transactions);
    sessions = new JdbcRefreshSessionRepository(jdbc, transactions);
  }

  @BeforeEach
  void clean() {
    jdbc.update("DELETE FROM refresh_session");
    jdbc.update("DELETE FROM principal_child");
    jdbc.update("DELETE FROM child_profile");
    jdbc.update("DELETE FROM external_identity");
    jdbc.update("DELETE FROM principal");
  }

  @Test
  void createsAndFindsPrincipalWithDefaultChild() {
    PrincipalId principalId = new PrincipalId("principal-1");
    ChildProfileId childId = new ChildProfileId("child-1");

    identities.createPrincipalWithDefaultChild(
        principalId, Platform.WECHAT, "wx-app", "openid-1", childId, Instant.EPOCH);

    PrincipalAccount account =
        identities.find(Platform.WECHAT, "wx-app", "openid-1").orElseThrow();
    assertThat(account.principalId()).isEqualTo(principalId);
    assertThat(account.defaultChildId()).isEqualTo(childId);
    assertThat(account.active()).isTrue();
    assertThat(identities.canAccess(principalId, childId)).isTrue();
  }

  @Test
  void rotatesRefreshSessionAtomically() {
    PrincipalId principalId = new PrincipalId("principal-1");
    identities.createPrincipalWithDefaultChild(
        principalId,
        Platform.WECHAT,
        "wx-app",
        "openid-1",
        new ChildProfileId("child-1"),
        Instant.EPOCH);
    sessions.create("old", principalId, Instant.parse("2026-09-29T00:00:00Z"), Instant.EPOCH);

    assertThat(
            sessions.rotate(
                "old",
                principalId,
                "new",
                Instant.parse("2026-10-29T00:00:00Z"),
                Instant.parse("2026-08-29T00:00:00Z")))
        .isTrue();
    assertThat(
            sessions.rotate(
                "old",
                principalId,
                "next",
                Instant.parse("2026-10-29T00:00:00Z"),
                Instant.parse("2026-08-29T00:00:01Z")))
        .isFalse();
  }
}
