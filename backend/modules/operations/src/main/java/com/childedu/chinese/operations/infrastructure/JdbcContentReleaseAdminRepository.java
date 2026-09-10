package com.childedu.chinese.operations.infrastructure;

import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import com.childedu.chinese.content.domain.ReleaseSnapshot;
import com.childedu.chinese.content.domain.ReleaseStatus;
import com.childedu.chinese.operations.api.CreateReleaseRequest;
import com.childedu.chinese.operations.api.RegisterReleaseRequest;
import com.childedu.chinese.operations.application.ContentReleaseAdminRepository;
import com.childedu.chinese.operations.application.ContentReleasePage;
import com.childedu.chinese.operations.application.ContentReleaseSummary;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;

/** 仅写入内容发布元数据表，不存放或拼接课程正文。 */
public class JdbcContentReleaseAdminRepository implements ContentReleaseAdminRepository {

  private final JdbcTemplate jdbc;
  private final ObjectMapper objectMapper;

  public JdbcContentReleaseAdminRepository(JdbcTemplate jdbc) {
    this(jdbc, new ObjectMapper());
  }

  public JdbcContentReleaseAdminRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
    this.jdbc = jdbc;
    this.objectMapper = objectMapper;
  }

  @Override
  public ContentReleasePage search(ReleaseStatus status, String cursor, int limit) {
    List<Object> parameters = new ArrayList<>();
    StringBuilder where = new StringBuilder(" WHERE 1 = 1");
    if (status != null) {
      where.append(" AND r.status = ?");
      parameters.add(status.name());
    }
    if (cursor != null) {
      where.append(" AND r.version < ?");
      parameters.add(cursor);
    }
    parameters.add(limit + 1);
    List<ContentReleaseSummary> fetched =
        jdbc.query(
            """
            SELECT r.version, r.rule_version, r.progression_rule_version,
                   r.content_level_rule_version, r.min_client_version, r.status,
                   COUNT(a.level) AS artifact_count, r.created_at, r.published_at
            FROM content_release r
            LEFT JOIN content_release_artifact a ON a.release_version = r.version
            """
                + where
                + """
                 GROUP BY r.version, r.rule_version, r.progression_rule_version,
                          r.content_level_rule_version, r.min_client_version, r.status,
                          r.created_at, r.published_at
                 ORDER BY r.version DESC
                 LIMIT ?
                """,
            (rs, row) ->
                new ContentReleaseSummary(
                    rs.getString("version"),
                    rs.getString("rule_version"),
                    rs.getString("progression_rule_version"),
                    rs.getString("content_level_rule_version"),
                    rs.getString("min_client_version"),
                    ReleaseStatus.valueOf(rs.getString("status")),
                    rs.getInt("artifact_count"),
                    rs.getTimestamp("created_at").toInstant(),
                    toInstant(rs.getTimestamp("published_at"))),
            parameters.toArray());
    boolean hasMore = fetched.size() > limit;
    List<ContentReleaseSummary> items =
        hasMore ? List.copyOf(fetched.subList(0, limit)) : List.copyOf(fetched);
    String nextCursor = hasMore ? items.getLast().version() : null;
    return new ContentReleasePage(items, nextCursor);
  }

  @Override
  public ContentReleaseSummary summary(String version) {
    return jdbc.queryForObject(
        """
        SELECT r.version, r.rule_version, r.progression_rule_version,
               r.content_level_rule_version, r.min_client_version, r.status,
               COUNT(a.level) AS artifact_count, r.created_at, r.published_at
        FROM content_release r
        LEFT JOIN content_release_artifact a ON a.release_version = r.version
        WHERE r.version = ?
        GROUP BY r.version, r.rule_version, r.progression_rule_version,
                 r.content_level_rule_version, r.min_client_version, r.status,
                 r.created_at, r.published_at
        """,
        (rs, row) ->
            new ContentReleaseSummary(
                rs.getString("version"),
                rs.getString("rule_version"),
                rs.getString("progression_rule_version"),
                rs.getString("content_level_rule_version"),
                rs.getString("min_client_version"),
                ReleaseStatus.valueOf(rs.getString("status")),
                rs.getInt("artifact_count"),
                rs.getTimestamp("created_at").toInstant(),
                toInstant(rs.getTimestamp("published_at"))),
        version);
  }

  @Override
  public Optional<ReleaseStatus> statusOf(String version) {
    return jdbc
        .query(
            "SELECT status FROM content_release WHERE version = ?",
            (rs, index) -> ReleaseStatus.valueOf(rs.getString("status")),
            version)
        .stream()
        .findFirst();
  }

  @Override
  public void insertDraft(RegisterReleaseRequest request, Instant now) {
    jdbc.update(
        """
        INSERT INTO content_release
          (version, rule_version, manifest_url, sha256, file_size, min_client_version,
           status, created_at, published_at)
        VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, NULL)
        """,
        request.version(),
        request.ruleVersion(),
        request.manifestUrl(),
        request.sha256(),
        request.fileSize(),
        request.minClientVersion(),
        Timestamp.from(now));
  }

  @Override
  public ReleaseSnapshot createSnapshot(
      CreateReleaseRequest request, List<ContentItemView> items, Instant now) {
    jdbc.update(
        """
        INSERT INTO content_release
          (version, rule_version, progression_rule_version, content_level_rule_version,
           manifest_url, sha256, file_size, min_client_version, status, created_at, published_at)
        VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, 'DRAFT', ?, NULL)
        """,
        request.version(),
        request.masteryRuleVersion(),
        request.progressionRuleVersion(),
        request.contentLevelRuleVersion(),
        request.minClientVersion(),
        Timestamp.from(now));
    for (ContentItemView item : items) {
      jdbc.update(
          """
          INSERT INTO content_release_item (release_version, item_id, revision)
          VALUES (?, ?, ?)
          """,
          request.version(),
          item.id(),
          item.revision());
    }
    return new ReleaseSnapshot(
        request.version(),
        request.masteryRuleVersion(),
        request.progressionRuleVersion(),
        request.contentLevelRuleVersion(),
        request.minClientVersion(),
        items);
  }

  @Override
  public ReleaseSnapshot snapshot(String version) {
    ReleaseSnapshot metadata =
        jdbc.queryForObject(
            """
            SELECT version, rule_version, progression_rule_version,
                   content_level_rule_version, min_client_version
            FROM content_release
            WHERE version = ?
            """,
            (rs, row) ->
                new ReleaseSnapshot(
                    rs.getString("version"),
                    rs.getString("rule_version"),
                    rs.getString("progression_rule_version"),
                    rs.getString("content_level_rule_version"),
                    rs.getString("min_client_version"),
                    List.of()),
            version);
    List<ContentItemView> items =
        jdbc.query(
            """
            SELECT i.id, i.type, 'ACTIVE' AS status, ri.revision AS current_revision,
                   r.level, r.difficulty, r.promotion_required, r.tags_json, r.payload_json
            FROM content_release_item ri
            JOIN content_item i ON i.id = ri.item_id
            JOIN content_revision r
              ON r.item_id = ri.item_id AND r.revision = ri.revision
            WHERE ri.release_version = ?
            ORDER BY i.id
            """,
            (rs, row) ->
                new ContentItemView(
                    rs.getString("id"),
                    ContentType.valueOf(rs.getString("type")),
                    ContentStatus.valueOf(rs.getString("status")),
                    rs.getInt("current_revision"),
                    ContentLevel.fromValue(rs.getInt("level")),
                    ContentLevel.fromValue(rs.getInt("difficulty")),
                    rs.getBoolean("promotion_required"),
                    readTags(rs.getString("tags_json")),
                    readPayload(rs.getString("payload_json"))),
            version);
    return new ReleaseSnapshot(
        metadata.version(),
        metadata.masteryRuleVersion(),
        metadata.progressionRuleVersion(),
        metadata.contentLevelRuleVersion(),
        metadata.minClientVersion(),
        items);
  }

  @Override
  public void registerArtifacts(
      String version, List<ContentReleaseArtifact> artifacts, Instant now) {
    if (artifacts.size() != ContentLevel.values().length
        || artifacts.stream().map(ContentReleaseArtifact::level).distinct().count()
            != ContentLevel.values().length) {
      throw new IllegalArgumentException("exactly one artifact per content level is required");
    }
    for (ContentReleaseArtifact artifact : artifacts) {
      jdbc.update(
          """
          INSERT INTO content_release_artifact
            (release_version, level, artifact_url, sha256, file_size, format, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          """,
          version,
          artifact.level().value(),
          artifact.artifactUrl(),
          artifact.sha256(),
          artifact.fileSize(),
          artifact.format(),
          Timestamp.from(now));
    }
  }

  @Override
  public List<ContentReleaseArtifact> artifacts(String version) {
    return jdbc.query(
        """
        SELECT a.release_version, a.level, a.artifact_url, a.sha256, a.file_size, a.format,
               r.rule_version, r.progression_rule_version, r.content_level_rule_version,
               r.min_client_version
        FROM content_release_artifact a
        JOIN content_release r ON r.version = a.release_version
        WHERE a.release_version = ?
        ORDER BY a.level
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
        version);
  }

  @Override
  public void updateStatus(String version, ReleaseStatus next, Instant now) {
    if (next == ReleaseStatus.PUBLISHED) {
      jdbc.update(
          "UPDATE content_release SET status = ?, published_at = ? WHERE version = ?",
          next.name(),
          Timestamp.from(now),
          version);
      return;
    }
    jdbc.update(
        "UPDATE content_release SET status = ? WHERE version = ?", next.name(), version);
  }

  private List<String> readTags(String json) {
    try {
      return objectMapper.readValue(json, new TypeReference<>() {});
    } catch (Exception error) {
      throw new IllegalStateException("cannot parse release tags", error);
    }
  }

  private com.fasterxml.jackson.databind.JsonNode readPayload(String json) {
    try {
      return objectMapper.readTree(json);
    } catch (Exception error) {
      throw new IllegalStateException("cannot parse release payload", error);
    }
  }

  private static Instant toInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }
}
