package com.childedu.chinese.operations;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.operations.application.AdminTokenDigest;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import com.childedu.chinese.operations.infrastructure.JdbcAdminPrincipalRepository;
import com.childedu.chinese.testsupport.MigrationSupport;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Set;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class JdbcAdminPrincipalRepositoryIT {

  private static JdbcTemplate jdbc;
  private static JdbcAdminPrincipalRepository repository;

  @BeforeAll
  static void migrate() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource();
    dataSource.setUrl(MySqlContainerSupport.jdbcUrl());
    dataSource.setUsername(MySqlContainerSupport.username());
    dataSource.setPassword(MySqlContainerSupport.password());
    Flyway.configure().dataSource(dataSource).locations(MigrationSupport.location()).load().migrate();
    jdbc = new JdbcTemplate(dataSource);
    repository = new JdbcAdminPrincipalRepository(jdbc, new ObjectMapper());
  }

  @BeforeEach
  void clean() {
    jdbc.update("DELETE FROM admin_principal");
  }

  @Test
  void resolvesRolesAndStatusByTokenDigest() {
    String digest = AdminTokenDigest.sha256("editor-token");
    jdbc.update(
        """
        INSERT INTO admin_principal
          (actor, token_sha256, roles_json, status, created_at, updated_at)
        VALUES (?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
        """,
        "editor-1",
        digest,
        "[\"EDITOR\",\"REVIEWER\"]");

    assertThat(repository.findByTokenDigest(digest))
        .contains(
            new AdminPrincipal(
                "editor-1", Set.of(AdminRole.EDITOR, AdminRole.REVIEWER), true));
    assertThat(repository.findByTokenDigest(AdminTokenDigest.sha256("unknown"))).isEmpty();
  }

  @Test
  void returnsDisabledPrincipalForAuthorizationToReject() {
    String digest = AdminTokenDigest.sha256("disabled-token");
    jdbc.update(
        """
        INSERT INTO admin_principal
          (actor, token_sha256, roles_json, status, created_at, updated_at)
        VALUES (?, ?, JSON_ARRAY('PUBLISHER'), 'DISABLED',
                CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
        """,
        "publisher-1",
        digest);

    assertThat(repository.findByTokenDigest(digest))
        .contains(
            new AdminPrincipal("publisher-1", Set.of(AdminRole.PUBLISHER), false));
  }
}
