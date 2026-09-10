package com.childedu.chinese.app.wiring;

import com.childedu.chinese.content.application.AbilityLevelReader;
import com.childedu.chinese.content.application.LeveledManifestQuery;
import com.childedu.chinese.content.application.PublishedArtifactReader;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import com.childedu.chinese.content.domain.ContentValidator;
import com.childedu.chinese.content.infrastructure.CorpusLoader;
import com.childedu.chinese.content.infrastructure.RuleSetLoader;
import com.childedu.chinese.learning.application.LearningEventAppender;
import com.childedu.chinese.learning.infrastructure.JdbcLearningEventRepository;
import com.childedu.chinese.operations.application.ContentCatalogRepository;
import com.childedu.chinese.operations.application.CorpusImportService;
import com.childedu.chinese.operations.application.OutboxHandler;
import com.childedu.chinese.operations.application.RawContentImportService;
import com.childedu.chinese.operations.infrastructure.JdbcContentCatalogRepository;
import com.childedu.chinese.shared.RuleVersion;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 单体装配层：把各模块无框架依赖的类接线为 Spring Bean。 */
@Configuration
public class BackendBeans {

  @Bean
  public JdbcTemplate jdbcTemplate(DataSource ds) {
    return new JdbcTemplate(ds);
  }

  @Bean
  public TransactionTemplate transactionTemplate(DataSource ds) {
    return new TransactionTemplate(new DataSourceTransactionManager(ds));
  }

  @Bean
  public JdbcLearningEventRepository learningEventRepository(JdbcTemplate jdbc) {
    return new JdbcLearningEventRepository(jdbc);
  }

  @Bean
  public LearningEventAppender learningEventAppender(JdbcLearningEventRepository repo) {
    return new LearningEventAppender(repo);
  }

  @Bean
  public CorpusLoader corpusLoader(
      @Value("${childedu.content.root:../frontend/content}") String contentRoot) {
    return new CorpusLoader(resolveContentRoot(contentRoot));
  }

  @Bean
  public ContentValidator contentValidator(
      ObjectMapper objectMapper,
      @Value("${childedu.content.root:../frontend/content}") String contentRoot,
      @Value("${childedu.content.level-rule-version:content-level-v1}")
          String contentLevelRuleVersion) {
    return new ContentValidator(
        objectMapper,
        new RuleSetLoader(resolveContentRoot(contentRoot))
            .loadContentLevel(new RuleVersion(contentLevelRuleVersion)));
  }

  @Bean
  public ContentCatalogRepository contentCatalogRepository(
      JdbcTemplate jdbc, ObjectMapper objectMapper) {
    return new JdbcContentCatalogRepository(jdbc, objectMapper);
  }

  @Bean
  public CorpusImportService corpusImportService(
      ContentCatalogRepository repository,
      ObjectMapper objectMapper,
      TransactionTemplate transactionTemplate) {
    return new CorpusImportService(repository, objectMapper, transactionTemplate);
  }

  @Bean
  public RawContentImportService rawContentImportService(
      ContentCatalogRepository repository,
      JdbcTemplate jdbc,
      TransactionTemplate transactionTemplate,
      ObjectMapper objectMapper) {
    return new RawContentImportService(repository, jdbc, transactionTemplate, objectMapper);
  }

  @Bean
  public OutboxHandler outboxHandler() {
    return record -> {
      switch (record.eventType()) {
        case "MASTERY_CHANGED", "PROGRESSION_CHANGED" -> {
          // Concrete projectors can replace this MVP routing seam.
        }
        default -> throw new IllegalStateException("unknown outbox eventType: " + record.eventType());
      }
    };
  }

  @Bean
  public AbilityLevelReader abilityLevelReader(JdbcTemplate jdbc) {
    return childId ->
        jdbc.query(
                "SELECT level FROM progression_projection WHERE child_profile_id = ?",
                (rs, row) -> ContentLevel.fromValue(rs.getInt("level")),
                childId.value())
            .stream()
            .findFirst();
  }

  @Bean
  public PublishedArtifactReader publishedArtifactReader(JdbcTemplate jdbc) {
    return level ->
        jdbc.query(
                """
                SELECT a.release_version, a.level, a.artifact_url, a.sha256,
                       a.file_size, a.format, r.rule_version,
                       r.progression_rule_version, r.content_level_rule_version,
                       r.min_client_version
                FROM content_release_artifact a
                JOIN content_release r ON r.version = a.release_version
                WHERE a.level = ? AND r.status = 'PUBLISHED'
                ORDER BY r.published_at DESC, r.version DESC
                LIMIT 1
                """,
                (rs, row) ->
                    new ContentReleaseArtifact(
                        rs.getString("release_version"),
                        ContentLevel.fromValue(rs.getInt("level")),
                        rs.getString("artifact_url"),
                        rs.getString("sha256"),
                        rs.getLong("file_size"),
                        rs.getString("format"),
                        rs.getString("rule_version"),
                        rs.getString("progression_rule_version"),
                        rs.getString("content_level_rule_version"),
                        rs.getString("min_client_version")),
                level.value())
            .stream()
            .findFirst();
  }

  @Bean
  public LeveledManifestQuery leveledManifestQuery(
      AbilityLevelReader abilities, PublishedArtifactReader artifacts) {
    return new LeveledManifestQuery(abilities, artifacts);
  }

  private static Path resolveContentRoot(String configuredRoot) {
    Path configured = Path.of(configuredRoot).normalize();
    if (Files.isDirectory(configured)) {
      return configured;
    }
    Path fromModuleDirectory = Path.of("..").resolve(configured).normalize();
    return Files.isDirectory(fromModuleDirectory) ? fromModuleDirectory : configured;
  }
}
