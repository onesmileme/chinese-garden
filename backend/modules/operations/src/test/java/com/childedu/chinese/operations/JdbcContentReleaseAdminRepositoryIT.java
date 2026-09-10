package com.childedu.chinese.operations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import com.childedu.chinese.content.domain.ReleaseStatus;
import com.childedu.chinese.operations.api.CreateReleaseRequest;
import com.childedu.chinese.operations.api.RegisterReleaseRequest;
import com.childedu.chinese.operations.application.AuditLog;
import com.childedu.chinese.operations.application.ContentAdminService;
import com.childedu.chinese.operations.application.ContentReleasePage;
import com.childedu.chinese.operations.application.ContentReleaseSummary;
import com.childedu.chinese.operations.infrastructure.JdbcContentReleaseAdminRepository;
import com.childedu.chinese.testsupport.MigrationSupport;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

class JdbcContentReleaseAdminRepositoryIT {

  private static JdbcTemplate jdbc;
  private static JdbcContentReleaseAdminRepository repository;
  private static DataSource dataSource;

  @BeforeAll
  static void migrate() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource();
    dataSource.setUrl(MySqlContainerSupport.jdbcUrl());
    dataSource.setUsername(MySqlContainerSupport.username());
    dataSource.setPassword(MySqlContainerSupport.password());
    Flyway.configure().dataSource(dataSource).locations(MigrationSupport.location()).load().migrate();
    JdbcContentReleaseAdminRepositoryIT.dataSource = dataSource;
    jdbc = new JdbcTemplate(dataSource);
    repository = new JdbcContentReleaseAdminRepository(jdbc);
  }

  @BeforeEach
  void clean() {
    jdbc.update("DELETE FROM content_release_artifact");
    jdbc.update("DELETE FROM content_release_item");
    jdbc.update("DELETE FROM content_release");
  }

  @Test
  void insertsAndPublishesARelease() {
    Instant createdAt = Instant.parse("2026-07-21T00:00:00Z");
    repository.insertDraft(
        new RegisterReleaseRequest(
            "corpus-v1",
            "mastery-v1",
            "https://example.test/content.tar.gz",
            "a".repeat(64),
            512L,
            "1.0.0"),
        createdAt);

    repository.updateStatus(
        "corpus-v1", ReleaseStatus.VALIDATED, createdAt.plusSeconds(10));
    repository.updateStatus(
        "corpus-v1", ReleaseStatus.PUBLISHED, createdAt.plusSeconds(20));

    assertThat(repository.statusOf("corpus-v1")).contains(ReleaseStatus.PUBLISHED);
    assertThat(
            jdbc.queryForObject(
                "SELECT published_at FROM content_release WHERE version = ?",
                Timestamp.class,
                "corpus-v1")
                .toInstant())
        .isEqualTo(createdAt.plusSeconds(20));
  }

  @Test
  void searchesDraftReleasesByDescendingVersionWithArtifactCounts() {
    Instant now = Instant.parse("2026-08-29T00:00:00Z");
    createRelease("corpus-v1", now);
    createRelease("corpus-v2", now.plusSeconds(1));
    createRelease("corpus-v3", now.plusSeconds(2));
    createRelease("corpus-v4", now.plusSeconds(3));
    repository.updateStatus("corpus-v4", ReleaseStatus.VALIDATED, now.plusSeconds(4));
    repository.registerArtifacts("corpus-v3", artifacts("corpus-v3"), now.plusSeconds(5));

    ContentReleasePage page = repository.search(ReleaseStatus.DRAFT, null, 2);

    assertThat(page.items())
        .extracting(ContentReleaseSummary::version)
        .containsExactly("corpus-v3", "corpus-v2");
    assertThat(page.nextCursor()).isEqualTo("corpus-v2");
    assertThat(page.items().getFirst().artifactCount()).isEqualTo(5);

    ContentReleasePage nextPage =
        repository.search(ReleaseStatus.DRAFT, page.nextCursor(), 2);
    assertThat(nextPage.items())
        .extracting(ContentReleaseSummary::version)
        .containsExactly("corpus-v1");
    assertThat(nextPage.nextCursor()).isNull();
  }

  @Test
  void returnsCurrentReleaseSummaryForCompleteDetails() {
    Instant now = Instant.parse("2026-08-29T00:00:00Z");
    createRelease("corpus-v6", now);
    repository.registerArtifacts("corpus-v6", artifacts("corpus-v6"), now.plusSeconds(1));
    repository.updateStatus("corpus-v6", ReleaseStatus.VALIDATED, now.plusSeconds(2));
    repository.updateStatus("corpus-v6", ReleaseStatus.PUBLISHED, now.plusSeconds(3));

    ContentReleaseSummary summary = repository.summary("corpus-v6");

    assertThat(summary.status()).isEqualTo(ReleaseStatus.PUBLISHED);
    assertThat(summary.artifactCount()).isEqualTo(5);
    assertThat(summary.publishedAt()).isEqualTo(now.plusSeconds(3));
  }

  @Test
  void rollsBackReleaseRegistrationWhenAuditInsertionFails() {
    Instant now = Instant.parse("2026-07-21T00:00:00Z");
    AuditLog failingAudit =
        (actor, action, target, before, after, reason, success, at) -> {
          throw new IllegalStateException("audit unavailable");
        };
    ContentAdminService service =
        new ContentAdminService(
            repository,
            failingAudit,
            Clock.fixed(now, ZoneOffset.UTC),
            new TransactionTemplate(new DataSourceTransactionManager(dataSource)));

    assertThatThrownBy(
            () ->
                service.register(
                    new RegisterReleaseRequest(
                        "corpus-v2",
                        "mastery-v1",
                        "https://example.test/content.tar.gz",
                        "a".repeat(64),
                        512L,
                        "1.0.0"),
                    "publisher-1"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("audit unavailable");

    assertThat(repository.statusOf("corpus-v2")).isEmpty();
  }

  private static void createRelease(String version, Instant now) {
    repository.createSnapshot(
        new CreateReleaseRequest(
            version, "mastery-v1", "progression-v1", "content-level-v1", "1.0.0"),
        java.util.List.of(),
        now);
  }

  private static java.util.List<ContentReleaseArtifact> artifacts(String version) {
    return java.util.stream.IntStream.rangeClosed(1, 5)
        .mapToObj(
            level ->
                new ContentReleaseArtifact(
                    version,
                    ContentLevel.fromValue(level),
                    "https://cdn.test/" + version + "/L" + level + ".tar.gz",
                    Integer.toHexString(level).repeat(64).substring(0, 64),
                    100L + level,
                    "tar+gzip",
                    "mastery-v1",
                    "progression-v1",
                    "content-level-v1",
                    "1.0.0"))
        .toList();
  }
}
