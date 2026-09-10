package com.childedu.chinese.operations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.childedu.chinese.content.domain.Character;
import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentLevelRules;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import com.childedu.chinese.content.domain.ContentValidator;
import com.childedu.chinese.content.domain.Corpus;
import com.childedu.chinese.content.domain.MinimumContent;
import com.childedu.chinese.operations.api.ContentPageResponse;
import com.childedu.chinese.operations.api.SaveContentRequest;
import com.childedu.chinese.operations.application.AuditLog;
import com.childedu.chinese.operations.application.ContentAuthoringService;
import com.childedu.chinese.operations.application.ContentRevisionConflict;
import com.childedu.chinese.operations.application.CorpusImportService;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import com.childedu.chinese.operations.infrastructure.JdbcAuditLog;
import com.childedu.chinese.operations.infrastructure.JdbcContentCatalogRepository;
import com.childedu.chinese.testsupport.MigrationSupport;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

class JdbcContentCatalogRepositoryIT {

  private static DataSource dataSource;
  private static JdbcTemplate jdbc;
  private static JdbcContentCatalogRepository repository;
  private static ObjectMapper objectMapper;

  @BeforeAll
  static void migrate() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource();
    dataSource.setUrl(MySqlContainerSupport.jdbcUrl());
    dataSource.setUsername(MySqlContainerSupport.username());
    dataSource.setPassword(MySqlContainerSupport.password());
    Flyway.configure().dataSource(dataSource).locations(MigrationSupport.location()).load().migrate();
    JdbcContentCatalogRepositoryIT.dataSource = dataSource;
    jdbc = new JdbcTemplate(dataSource);
    objectMapper = new ObjectMapper();
    repository = new JdbcContentCatalogRepository(jdbc, objectMapper);
  }

  @BeforeEach
  void clean() {
    jdbc.update("DELETE FROM admin_audit_log");
    jdbc.update("DELETE FROM content_revision");
    jdbc.update("DELETE FROM content_item");
  }

  @Test
  void authorsImmutableRevisionsAndAuditsStatusChanges() throws Exception {
    Instant now = Instant.parse("2026-08-25T08:00:00Z");
    ContentAuthoringService service = authoringService(new JdbcAuditLog(jdbc), now);
    AdminPrincipal editor =
        new AdminPrincipal("editor-1", Set.of(AdminRole.EDITOR), true);
    AdminPrincipal reviewer =
        new AdminPrincipal("reviewer-1", Set.of(AdminRole.REVIEWER), true);
    SaveContentRequest original =
        new SaveContentRequest(
            "hz-yue-月",
            ContentType.CHARACTER,
            ContentLevel.L1,
            ContentLevel.L1,
            true,
            List.of("自然"),
            objectMapper.readTree("{\"char\":\"月\"}"));
    SaveContentRequest changed =
        new SaveContentRequest(
            "hz-yue-月",
            ContentType.CHARACTER,
            ContentLevel.L1,
            ContentLevel.L2,
            true,
            List.of("自然", "基础"),
            objectMapper.readTree("{\"char\":\"月\",\"pinyin\":\"yuè\"}"));

    service.create(original, editor);
    ContentItemView updated = service.update("hz-yue-月", 1, changed, editor);
    ContentItemView activated = service.activate("hz-yue-月", 2, reviewer);
    ContentItemView archived = service.archive("hz-yue-月", 2, editor);

    assertThat(updated.revision()).isEqualTo(2);
    assertThat(activated.status()).isEqualTo(ContentStatus.ACTIVE);
    assertThat(archived.status()).isEqualTo(ContentStatus.ARCHIVED);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM content_revision", Integer.class))
        .isEqualTo(2);
    assertThat(
            jdbc.queryForList(
                """
                SELECT action
                FROM admin_audit_log
                WHERE target = ?
                ORDER BY id
                """,
                String.class,
                "hz-yue-月"))
        .containsExactly("CREATE", "UPDATE", "ACTIVATE", "ARCHIVE");
    assertThat(
            jdbc.queryForObject(
                """
                SELECT JSON_UNQUOTE(JSON_EXTRACT(after_json, '$.status'))
                FROM admin_audit_log
                WHERE action = 'ACTIVATE' AND target = ?
                """,
                String.class,
                "hz-yue-月"))
        .isEqualTo("ACTIVE");
    ContentPageResponse page =
        service.search(
            ContentType.CHARACTER,
            ContentLevel.L1,
            ContentStatus.ARCHIVED,
            "基础",
            "yuè",
            null,
            10);
    assertThat(page.items()).extracting(ContentItemView::id).containsExactly("hz-yue-月");
    assertThat(page.nextCursor()).isNull();

    assertThatThrownBy(() -> service.update("hz-yue-月", 1, changed, editor))
        .isInstanceOf(ContentRevisionConflict.class);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM content_revision", Integer.class))
        .isEqualTo(2);
  }

  @Test
  void rollsBackTheContentWriteWhenAuditInsertionFails() throws Exception {
    Instant now = Instant.parse("2026-08-25T08:00:00Z");
    AuditLog failingAudit =
        (actor, action, target, before, after, reason, success, at) -> {
          throw new IllegalStateException("audit unavailable");
        };
    ContentAuthoringService service = authoringService(failingAudit, now);
    SaveContentRequest request =
        new SaveContentRequest(
            "hz-yue-月",
            ContentType.CHARACTER,
            ContentLevel.L1,
            ContentLevel.L1,
            true,
            List.of(),
            objectMapper.readTree("{\"char\":\"月\"}"));

    assertThatThrownBy(
            () ->
                service.create(
                    request,
                    new AdminPrincipal("editor-1", Set.of(AdminRole.EDITOR), true)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("audit unavailable");

    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM content_item", Integer.class)).isZero();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM content_revision", Integer.class)).isZero();
  }

  @Test
  void importsAnItemAndItsRevision() {
    Instant now = Instant.parse("2026-08-25T08:00:00Z");

    assertThat(repository.isEmpty()).isTrue();

    repository.importRevision(
        "hz-shan-山",
        "CHARACTER",
        ContentStatus.ACTIVE,
        1,
        2,
        3,
        true,
        List.of("自然", "基础"),
        "{\"char\":\"山\",\"strokes\":3}",
        "migration",
        now);

    assertThat(repository.isEmpty()).isFalse();
    assertThat(
            jdbc.queryForMap(
                """
                SELECT type, status, current_revision, created_at, updated_at
                FROM content_item
                WHERE id = ?
                """,
                "hz-shan-山"))
        .containsAllEntriesOf(
            Map.of(
                "type", "CHARACTER",
                "status", "ACTIVE",
                "current_revision", 1));
    assertThat(
            jdbc.queryForMap(
                """
                SELECT revision, level, difficulty, promotion_required,
                       tags_json, payload_json, created_by
                FROM content_revision
                WHERE item_id = ?
                """,
                "hz-shan-山"))
        .satisfies(
            row -> {
              assertThat(row.get("revision")).isEqualTo(1);
              assertThat(row.get("level")).isEqualTo(2);
              assertThat(row.get("difficulty")).isEqualTo(3);
              assertThat(row.get("promotion_required")).isEqualTo(true);
              assertThat(row.get("tags_json").toString()).contains("自然", "基础");
              assertThat(row.get("payload_json").toString()).contains("\"char\": \"山\"");
              assertThat(row.get("created_by")).isEqualTo("migration");
            });
  }

  @Test
  void importsCorpusOnlyOnceWhenTwoApplicationInstancesStartConcurrently() throws Exception {
    Corpus corpus =
        new Corpus(
            List.of(
                new Character(
                    "hz-shan-山",
                    "山",
                    "shān",
                    "img-shan",
                    "nature",
                    3,
                    1,
                    1,
                    true,
                    ContentStatus.ACTIVE,
                    List.of("基础"),
                    1)),
            List.of(),
            List.of());
    CorpusImportService first = importService();
    CorpusImportService second = importService();
    CountDownLatch start = new CountDownLatch(1);

    try (var executor = Executors.newFixedThreadPool(2)) {
      Future<Integer> firstResult =
          executor.submit(
              () -> {
                start.await();
                return first.importIfEmpty(corpus, "first-instance", Instant.now());
              });
      Future<Integer> secondResult =
          executor.submit(
              () -> {
                start.await();
                return second.importIfEmpty(corpus, "second-instance", Instant.now());
              });

      start.countDown();

      assertThat(List.of(firstResult.get(), secondResult.get())).containsExactlyInAnyOrder(0, 1);
    }
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM content_item", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM content_revision", Integer.class))
        .isEqualTo(1);
  }

  private CorpusImportService importService() {
    JdbcTemplate instanceJdbc = new JdbcTemplate(dataSource);
    return new CorpusImportService(
        new JdbcContentCatalogRepository(instanceJdbc, new ObjectMapper()),
        new ObjectMapper(),
        new TransactionTemplate(new DataSourceTransactionManager(dataSource)));
  }

  private ContentAuthoringService authoringService(AuditLog audit, Instant now) {
    return new ContentAuthoringService(
        repository,
        audit,
        objectMapper,
        new ContentValidator(objectMapper, validationRules()),
        new TransactionTemplate(new DataSourceTransactionManager(dataSource)),
        Clock.fixed(now, ZoneOffset.UTC));
  }

  private static ContentLevelRules validationRules() {
    MinimumContent none = new MinimumContent(0, 0, 0);
    return new ContentLevelRules(
        "content-level-test", Map.of(1, none, 2, none, 3, none, 4, none, 5, none));
  }
}
