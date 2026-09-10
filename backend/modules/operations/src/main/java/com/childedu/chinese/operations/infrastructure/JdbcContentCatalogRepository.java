package com.childedu.chinese.operations.infrastructure;

import com.childedu.chinese.content.domain.ContentDraft;
import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import com.childedu.chinese.operations.application.ContentCatalogRepository;
import com.childedu.chinese.operations.application.ContentRevisionConflict;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;

public class JdbcContentCatalogRepository implements ContentCatalogRepository {

  private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

  private final JdbcTemplate jdbc;
  private final ObjectMapper objectMapper;

  public JdbcContentCatalogRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
    this.jdbc = jdbc;
    this.objectMapper = objectMapper;
  }

  @Override
  public ContentItemView create(ContentDraft draft, String actor, Instant now) {
    Timestamp timestamp = Timestamp.from(now);
    jdbc.update(
        """
        INSERT INTO content_item
          (id, type, status, current_revision, created_at, updated_at)
        VALUES (?, ?, 'DRAFT', 1, ?, ?)
        """,
        draft.id(),
        draft.type().name(),
        timestamp,
        timestamp);
    jdbc.update(
        """
        INSERT INTO content_revision
          (item_id, revision, level, difficulty, promotion_required,
           tags_json, payload_json, created_by, created_at)
        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
        """,
        draft.id(),
        draft.level().value(),
        draft.difficulty().value(),
        draft.promotionRequired(),
        toJson(draft.tags()),
        draft.payload().toString(),
        actor,
        timestamp);
    return new ContentItemView(
        draft.id(),
        draft.type(),
        ContentStatus.DRAFT,
        1,
        draft.level(),
        draft.difficulty(),
        draft.promotionRequired(),
        draft.tags(),
        draft.payload());
  }

  @Override
  public ContentItemView update(
      String id, int expectedRevision, ContentDraft draft, String actor, Instant now) {
    CurrentItem current =
        jdbc.query(
                """
                SELECT type, current_revision
                FROM content_item
                WHERE id = ?
                FOR UPDATE
                """,
                (resultSet, rowNumber) ->
                    new CurrentItem(
                        resultSet.getString("type"), resultSet.getInt("current_revision")),
                id)
            .stream()
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("content item not found: " + id));
    if (current.revision() != expectedRevision) {
      throw new ContentRevisionConflict(id, expectedRevision, current.revision());
    }
    if (!current.type().equals(draft.type().name())) {
      throw new IllegalArgumentException("content type cannot be changed");
    }

    int nextRevision = expectedRevision + 1;
    Timestamp timestamp = Timestamp.from(now);
    jdbc.update(
        """
        INSERT INTO content_revision
          (item_id, revision, level, difficulty, promotion_required,
           tags_json, payload_json, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        id,
        nextRevision,
        draft.level().value(),
        draft.difficulty().value(),
        draft.promotionRequired(),
        toJson(draft.tags()),
        draft.payload().toString(),
        actor,
        timestamp);
    int updated =
        jdbc.update(
            """
            UPDATE content_item
            SET current_revision = ?, status = 'DRAFT', updated_at = ?
            WHERE id = ? AND current_revision = ?
            """,
            nextRevision,
            timestamp,
            id,
            expectedRevision);
    if (updated != 1) {
      throw new ContentRevisionConflict(id, expectedRevision, current.revision());
    }
    return new ContentItemView(
        id,
        draft.type(),
        ContentStatus.DRAFT,
        nextRevision,
        draft.level(),
        draft.difficulty(),
        draft.promotionRequired(),
        draft.tags(),
        draft.payload());
  }

  @Override
  public Optional<ContentItemView> find(String id) {
    return jdbc
        .query(
            """
            SELECT i.id, i.type, i.status, i.current_revision,
                   r.level, r.difficulty, r.promotion_required, r.tags_json, r.payload_json
            FROM content_item i
            JOIN content_revision r
              ON r.item_id = i.id AND r.revision = i.current_revision
            WHERE i.id = ?
            """,
            this::mapView,
            id)
        .stream()
        .findFirst();
  }

  @Override
  public List<ContentItemView> search(
      ContentType type,
      ContentLevel level,
      ContentStatus status,
      String tag,
      String keyword,
      String cursor,
      int limit) {
    String typeValue = type == null ? null : type.name();
    Integer levelValue = level == null ? null : level.value();
    String statusValue = status == null ? null : status.name();
    return jdbc.query(
        """
        SELECT i.id, i.type, i.status, i.current_revision,
               r.level, r.difficulty, r.promotion_required, r.tags_json, r.payload_json
        FROM content_item i
        JOIN content_revision r
          ON r.item_id = i.id AND r.revision = i.current_revision
        WHERE (? IS NULL OR i.type = ?)
          AND (? IS NULL OR r.level = ?)
          AND (? IS NULL OR i.status = ?)
          AND (? IS NULL OR JSON_CONTAINS(r.tags_json, JSON_QUOTE(?)))
          AND (? IS NULL
               OR i.id LIKE CONCAT('%', ?, '%')
               OR CAST(r.payload_json AS CHAR) LIKE CONCAT('%', ?, '%'))
          AND (? IS NULL OR i.id > ?)
        ORDER BY i.id
        LIMIT ?
        """,
        this::mapView,
        typeValue,
        typeValue,
        levelValue,
        levelValue,
        statusValue,
        statusValue,
        tag,
        tag,
        keyword,
        keyword,
        keyword,
        cursor,
        cursor,
        limit);
  }

  @Override
  public List<ContentItemView> activeCatalogSnapshot() {
    return jdbc.query(
        """
        SELECT i.id, i.type, i.status, i.current_revision,
               r.level, r.difficulty, r.promotion_required, r.tags_json, r.payload_json
        FROM content_item i
        JOIN content_revision r
          ON r.item_id = i.id AND r.revision = i.current_revision
        WHERE i.status = 'ACTIVE'
        ORDER BY i.id
        """,
        this::mapView);
  }

  @Override
  public ContentItemView changeStatus(
      String id, int expectedRevision, ContentStatus status, Instant now) {
    int actualRevision =
        jdbc.query(
                """
                SELECT current_revision
                FROM content_item
                WHERE id = ?
                FOR UPDATE
                """,
                (resultSet, rowNumber) -> resultSet.getInt("current_revision"),
                id)
            .stream()
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("content item not found: " + id));
    if (actualRevision != expectedRevision) {
      throw new ContentRevisionConflict(id, expectedRevision, actualRevision);
    }
    int updated =
        jdbc.update(
            """
            UPDATE content_item
            SET status = ?, updated_at = ?
            WHERE id = ? AND current_revision = ?
            """,
            status.name(),
            Timestamp.from(now),
            id,
            expectedRevision);
    if (updated != 1) {
      throw new ContentRevisionConflict(id, expectedRevision, actualRevision);
    }
    return find(id)
        .orElseThrow(() -> new IllegalArgumentException("content item not found: " + id));
  }

  @Override
  public void lockForInitialImport() {
    jdbc.queryForObject(
        """
        SELECT lock_name
        FROM content_import_lock
        WHERE lock_name = 'initial-corpus-import'
        FOR UPDATE
        """,
        String.class);
  }

  @Override
  public boolean isEmpty() {
    Boolean empty = jdbc.queryForObject("SELECT COUNT(*) = 0 FROM content_item", Boolean.class);
    return Boolean.TRUE.equals(empty);
  }

  @Override
  public void importRevision(
      String id,
      String type,
      ContentStatus status,
      int revision,
      int level,
      int difficulty,
      boolean promotionRequired,
      List<String> tags,
      String payloadJson,
      String actor,
      Instant now) {
    Timestamp timestamp = Timestamp.from(now);
    jdbc.update(
        """
        INSERT INTO content_item
          (id, type, status, current_revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        id,
        type,
        status.name(),
        revision,
        timestamp,
        timestamp);
    jdbc.update(
        """
        INSERT INTO content_revision
          (item_id, revision, level, difficulty, promotion_required,
           tags_json, payload_json, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        id,
        revision,
        level,
        difficulty,
        promotionRequired,
        toJson(tags),
        payloadJson,
        actor,
        timestamp);
  }

  @Override
  public void batchCreate(Collection<ContentDraft> drafts, String actor, Instant now) {
    Timestamp timestamp = Timestamp.from(now);
    for (ContentDraft draft : drafts) {
      jdbc.update(
          """
          INSERT INTO content_item
            (id, type, status, current_revision, created_at, updated_at)
          VALUES (?, ?, 'DRAFT', 1, ?, ?)
          ON DUPLICATE KEY UPDATE id = id
          """,
          draft.id(),
          draft.type().name(),
          timestamp,
          timestamp);
      jdbc.update(
          """
          INSERT INTO content_revision
            (item_id, revision, level, difficulty, promotion_required,
             tags_json, payload_json, created_by, created_at)
          VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
          """,
          draft.id(),
          draft.level().value(),
          draft.difficulty().value(),
          draft.promotionRequired(),
          toJson(draft.tags()),
          draft.payload().toString(),
          actor,
          timestamp);
    }
  }

  private String toJson(List<String> tags) {
    try {
      return objectMapper.writeValueAsString(tags);
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("cannot serialize content tags", e);
    }
  }

  private List<String> readTags(String json) {
    try {
      return objectMapper.readValue(json, STRING_LIST);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("cannot parse content tags", e);
    }
  }

  private JsonNode readPayload(String json) {
    try {
      return objectMapper.readTree(json);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("cannot parse content payload", e);
    }
  }

  private ContentItemView mapView(ResultSet resultSet, int rowNumber) throws SQLException {
    return new ContentItemView(
        resultSet.getString("id"),
        ContentType.valueOf(resultSet.getString("type")),
        ContentStatus.valueOf(resultSet.getString("status")),
        resultSet.getInt("current_revision"),
        ContentLevel.fromValue(resultSet.getInt("level")),
        ContentLevel.fromValue(resultSet.getInt("difficulty")),
        resultSet.getBoolean("promotion_required"),
        readTags(resultSet.getString("tags_json")),
        readPayload(resultSet.getString("payload_json")));
  }

  private record CurrentItem(String type, int revision) {}
}
