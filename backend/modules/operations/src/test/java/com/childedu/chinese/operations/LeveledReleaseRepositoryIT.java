package com.childedu.chinese.operations;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.operations.api.CreateReleaseRequest;
import com.childedu.chinese.operations.infrastructure.JdbcContentCatalogRepository;
import com.childedu.chinese.operations.infrastructure.JdbcContentReleaseAdminRepository;
import com.childedu.chinese.testsupport.MigrationSupport;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class LeveledReleaseRepositoryIT {

  private static JdbcTemplate jdbc;
  private static JdbcContentCatalogRepository catalog;
  private static JdbcContentReleaseAdminRepository releases;

  @BeforeAll
  static void migrate() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource();
    dataSource.setUrl(MySqlContainerSupport.jdbcUrl());
    dataSource.setUsername(MySqlContainerSupport.username());
    dataSource.setPassword(MySqlContainerSupport.password());
    Flyway.configure().dataSource(dataSource).locations(MigrationSupport.location()).load().migrate();
    jdbc = new JdbcTemplate(dataSource);
    catalog = new JdbcContentCatalogRepository(jdbc, new ObjectMapper());
    releases = new JdbcContentReleaseAdminRepository(jdbc);
  }

  @BeforeEach
  void clean() {
    jdbc.update("DELETE FROM content_release_artifact");
    jdbc.update("DELETE FROM content_release_item");
    jdbc.update("DELETE FROM content_release");
    jdbc.update("DELETE FROM content_revision");
    jdbc.update("DELETE FROM content_item");
  }

  @AfterEach
  void cleanAfter() {
    clean();
  }

  @Test
  void snapshotsOnlyActiveCurrentRevisionsAndStoresFiveArtifacts() {
    Instant now = Instant.parse("2026-08-29T00:00:00Z");
    catalog.importRevision(
        "hz-yue",
        "CHARACTER",
        com.childedu.chinese.content.domain.ContentStatus.ACTIVE,
        1,
        1,
        1,
        true,
        List.of("自然"),
        "{\"char\":\"月\",\"pinyin\":\"yuè\",\"initial\":\"y\",\"final\":\"ue\",\"tone\":4}",
        "reviewer",
        now);
    catalog.importRevision(
        "hz-draft",
        "CHARACTER",
        com.childedu.chinese.content.domain.ContentStatus.DRAFT,
        1,
        2,
        2,
        false,
        List.of(),
        "{\"char\":\"云\"}",
        "editor",
        now);

    List<ContentItemView> active = catalog.activeCatalogSnapshot();
    releases.createSnapshot(
        new CreateReleaseRequest(
            "corpus-v6", "mastery-v1", "progression-v1", "content-level-v1", "1.0.0"),
        active,
        now);
    catalog.changeStatus("hz-yue", 1, ContentStatus.ARCHIVED, now.plusSeconds(1));
    releases.registerArtifacts(
        "corpus-v6",
        java.util.stream.IntStream.rangeClosed(1, 5)
            .mapToObj(
                level ->
                    new ContentReleaseArtifact(
                        "corpus-v6",
                        ContentLevel.fromValue(level),
                        "https://cdn.test/corpus-v6/L" + level + ".tar.gz",
                        Integer.toHexString(level).repeat(64).substring(0, 64),
                        100L + level,
                        "tar+gzip",
                        "mastery-v1",
                        "progression-v1",
                        "content-level-v1",
                        "1.0.0"))
            .toList(),
        now);

    assertThat(releases.snapshot("corpus-v6").items())
        .extracting(ContentItemView::id)
        .containsExactly("hz-yue");
    assertThat(releases.snapshot("corpus-v6").items())
        .extracting(ContentItemView::status)
        .containsExactly(ContentStatus.ACTIVE);
    assertThat(releases.artifacts("corpus-v6"))
        .extracting(ContentReleaseArtifact::level)
        .containsExactly(ContentLevel.L1, ContentLevel.L2, ContentLevel.L3, ContentLevel.L4, ContentLevel.L5);
  }
}
