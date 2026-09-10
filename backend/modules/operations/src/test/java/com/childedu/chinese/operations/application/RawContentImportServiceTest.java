package com.childedu.chinese.operations.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.content.domain.ContentDraft;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import com.childedu.chinese.operations.infrastructure.JdbcContentCatalogRepository;
import com.childedu.chinese.testsupport.MigrationSupport;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

class RawContentImportServiceTest {

  private static final Instant NOW = Instant.parse("2026-08-26T08:00:00Z");

  private static DataSource dataSource;
  private static JdbcTemplate jdbc;
  private static ObjectMapper objectMapper;
  private static ContentCatalogRepository repository;
  private static TransactionTemplate transactionTemplate;
  private static RawContentImportService service;

  @BeforeAll
  static void migrate() {
    DriverManagerDataSource ds = new DriverManagerDataSource();
    ds.setUrl(MySqlContainerSupport.jdbcUrl());
    ds.setUsername(MySqlContainerSupport.username());
    ds.setPassword(MySqlContainerSupport.password());
    Flyway.configure().dataSource(ds).locations(MigrationSupport.location()).load().migrate();
    dataSource = ds;
    jdbc = new JdbcTemplate(dataSource);
    objectMapper = new ObjectMapper();
    repository = new JdbcContentCatalogRepository(jdbc, objectMapper);
    transactionTemplate = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    service = new RawContentImportService(repository, jdbc, transactionTemplate, objectMapper);
  }

  @BeforeEach
  void clean() {
    jdbc.update("DELETE FROM content_import_candidate");
    jdbc.update("DELETE FROM content_import_batch");
    jdbc.update("DELETE FROM content_revision");
    jdbc.update("DELETE FROM content_item");
  }

  @Test
  void shouldCreateBatchAndAppendCandidates() {
    var batch = service.createBatch("raw-corpus-v1", Map.of("characters", 3000), "importer", NOW);
    assertThat(batch.status()).isEqualTo("RUNNING");
    assertThat(batch.id()).hasSize(26);

    var candidates = List.of(makeCandidate("hz-ni-你", "CHARACTER", 1, "XINHUA_WORD", "word:你"));
    var result = service.appendCandidates(batch.id(), candidates, "importer", NOW);
    assertThat(result.imported()).isEqualTo(1);
    assertThat(result.skipped()).isEqualTo(0);
    assertThat(result.rejected()).isEqualTo(0);
  }

  @Test
  void shouldSkipExistingContent() {
    // First import
    var batch = service.createBatch("raw-corpus-v1", Map.of(), "importer", NOW);
    var candidates = List.of(makeCandidate("hz-skip-跳", "CHARACTER", 1, "XINHUA_WORD", "word:跳"));
    service.appendCandidates(batch.id(), candidates, "importer", NOW);

    // Second import of same candidate
    var batch2 = service.createBatch("raw-corpus-v1", Map.of(), "importer", NOW);
    var result = service.appendCandidates(batch2.id(), candidates, "importer", NOW);
    assertThat(result.imported()).isEqualTo(0);
    assertThat(result.skipped()).isEqualTo(1);
  }

  @Test
  void shouldNotOverwriteActiveContent() {
    // Pre-create ACTIVE content
    repository.create(makeDraft("hz-active-活", ContentType.CHARACTER), "admin", NOW);
    repository.changeStatus("hz-active-活", 1, ContentStatus.ACTIVE, NOW);

    var batch = service.createBatch("raw-corpus-v1", Map.of(), "importer", NOW);
    var candidates = List.of(makeCandidate("hz-active-活", "CHARACTER", 5, "XINHUA_WORD", "word:活"));
    var result = service.appendCandidates(batch.id(), candidates, "importer", NOW);
    // Should skip because ACTIVE content exists
    assertThat(result.imported()).isEqualTo(0);
  }

  @Test
  void shouldCompleteBatch() {
    var batch = service.createBatch("raw-corpus-v1", Map.of(), "importer", NOW);
    var candidates = List.of(
      makeCandidate("hz-a-啊", "CHARACTER", 1, "XINHUA_WORD", "word:啊"),
      makeCandidate("hz-b-吧", "CHARACTER", 2, "XINHUA_WORD", "word:吧")
    );
    service.appendCandidates(batch.id(), candidates, "importer", NOW);
    var completed = service.completeBatch(batch.id(), "importer", NOW);
    assertThat(completed.status()).isEqualTo("COMPLETED");
    assertThat(completed.completedAt()).isNotNull();
  }

  @Test
  void shouldRejectAppendAfterComplete() {
    var batch = service.createBatch("raw-corpus-v1", Map.of(), "importer", NOW);
    service.completeBatch(batch.id(), "importer", NOW);
    var candidates = List.of(makeCandidate("hz-x-某", "CHARACTER", 1, "XINHUA_WORD", "word:某"));
    var result = service.appendCandidates(batch.id(), candidates, "importer", NOW);
    assertThat(result.skipped()).isEqualTo(1);
  }

  private static RawContentImportService.RawCandidate makeCandidate(
      String id, String type, int level, String source, String sourceRef) {
    return new RawContentImportService.RawCandidate(
      source + ":" + sourceRef, source, sourceRef, "abc123",
      "raw-corpus-v1", id, type, level, level, false, List.of(),
      Map.of(), 100.0);
  }

  private static ContentDraft makeDraft(String id, ContentType type) {
    ObjectNode payload = objectMapper.createObjectNode().put("char", "x").put("pinyin", "x");
    return new ContentDraft(id, type, ContentLevel.L1, ContentLevel.L1, false, List.of(), payload);
  }
}