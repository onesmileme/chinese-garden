package com.childedu.chinese.app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.childedu.chinese.testsupport.MySqlContainerSupport;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLIntegrityConstraintViolationException;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

class FlywayMigrationIT {

  @Test
  void appliesAllMigrationsAndCreatesCoreTables() throws Exception {
    Flyway flyway =
        Flyway.configure()
            .dataSource(
                MySqlContainerSupport.jdbcUrl(),
                MySqlContainerSupport.username(),
                MySqlContainerSupport.password())
            .locations("classpath:db/migration")
            .load();
    flyway.migrate();

    Set<String> tables = new HashSet<>();
    try (Connection c =
            DriverManager.getConnection(
                MySqlContainerSupport.jdbcUrl(),
                MySqlContainerSupport.username(),
                MySqlContainerSupport.password());
        ResultSet rs =
            c.getMetaData().getTables(c.getCatalog(), null, "%", new String[] {"TABLE"})) {
      while (rs.next()) {
        tables.add(rs.getString("TABLE_NAME").toLowerCase());
      }
    }

    assertThat(tables)
        .contains(
            "principal",
            "external_identity",
            "child_profile",
            "principal_child",
            "content_release",
            "content_release_artifact",
            "learning_session",
            "learning_event",
            "mastery_projection",
            "progression_projection",
            "reward_ledger",
            "sync_device",
            "outbox_event",
            "content_item",
            "content_revision",
            "content_release_item",
            "content_import_lock",
            "admin_principal",
            "admin_audit_log",
            "refresh_session");
  }

  @Test
  void contentAuthoringTablesRejectBrokenReferences() throws Exception {
    Flyway.configure()
        .dataSource(
            MySqlContainerSupport.jdbcUrl(),
            MySqlContainerSupport.username(),
            MySqlContainerSupport.password())
        .locations("classpath:db/migration")
        .load()
        .migrate();

    try (Connection connection =
            DriverManager.getConnection(
                MySqlContainerSupport.jdbcUrl(),
                MySqlContainerSupport.username(),
                MySqlContainerSupport.password());
        Statement statement = connection.createStatement()) {
      assertThatThrownBy(
              () ->
                  statement.executeUpdate(
                      """
                      INSERT INTO content_revision
                        (item_id, revision, level, difficulty, promotion_required,
                         tags_json, payload_json, created_by, created_at)
                      VALUES
                        ('missing-item', 1, 1, 1, FALSE, JSON_ARRAY(), JSON_OBJECT(),
                         'test', CURRENT_TIMESTAMP(3))
                      """))
          .isInstanceOf(SQLIntegrityConstraintViolationException.class);

      statement.executeUpdate(
          """
          INSERT INTO content_item
            (id, type, status, current_revision, created_at, updated_at)
          VALUES
            ('fk-test-item', 'CHARACTER', 'ACTIVE', 1,
             CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
          """);
      statement.executeUpdate(
          """
          INSERT INTO content_revision
            (item_id, revision, level, difficulty, promotion_required,
             tags_json, payload_json, created_by, created_at)
          VALUES
            ('fk-test-item', 1, 1, 1, FALSE, JSON_ARRAY(), JSON_OBJECT(),
             'test', CURRENT_TIMESTAMP(3))
          """);

      assertThatThrownBy(
              () ->
                  statement.executeUpdate(
                      """
                      INSERT INTO content_release_item (release_version, item_id, revision)
                      VALUES ('missing-release', 'fk-test-item', 1)
                      """))
          .isInstanceOf(SQLIntegrityConstraintViolationException.class);

      statement.executeUpdate(
          """
          INSERT INTO content_release
            (version, rule_version, manifest_url, sha256, file_size,
             min_client_version, status, created_at)
          VALUES
            ('fk-test-release', 'rule-v1', 'https://example.test/manifest',
             REPEAT('0', 64), 1, '1.0.0', 'DRAFT', CURRENT_TIMESTAMP(3))
          """);

      assertThatThrownBy(
              () ->
                  statement.executeUpdate(
                      """
                      INSERT INTO content_release_item (release_version, item_id, revision)
                      VALUES ('fk-test-release', 'fk-test-item', 99)
                      """))
          .isInstanceOf(SQLIntegrityConstraintViolationException.class);
    }
  }
}
