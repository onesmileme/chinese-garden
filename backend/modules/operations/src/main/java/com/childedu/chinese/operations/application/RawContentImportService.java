package com.childedu.chinese.operations.application;

import com.childedu.chinese.content.domain.ContentDraft;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

public class RawContentImportService {

  private final ContentCatalogRepository repository;
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transactionTemplate;
  private final ObjectMapper objectMapper;

  public RawContentImportService(
      ContentCatalogRepository repository,
      JdbcTemplate jdbc,
      TransactionTemplate transactionTemplate,
      ObjectMapper objectMapper) {
    this.repository = repository;
    this.jdbc = jdbc;
    this.transactionTemplate = transactionTemplate;
    this.objectMapper = objectMapper;
  }

  public record RawCandidate(
      @JsonProperty("importKey") String importKey,
      @JsonProperty("source") String sourceName,
      @JsonProperty("sourceRef") String sourceRef,
      @JsonProperty("sourceHash") String sourceHash,
      @JsonProperty("ruleVersion") String ruleVersion,
      @JsonProperty("id") String id,
      @JsonProperty("type") String contentType,
      @JsonProperty("suggestedLevel") int suggestedLevel,
      @JsonProperty("suggestedDifficulty") int suggestedDifficulty,
      @JsonProperty("promotionRequired") boolean promotionRequired,
      @JsonProperty("tags") List<String> tags,
      @JsonProperty("payload") Map<String, Object> payload,
      @JsonProperty("score") double score) {}

  public record BatchView(
      String id, String ruleVersion, String status, Map<String, Object> requested,
      Instant startedAt, Instant completedAt) {}

  public record AppendResult(int imported, int skipped, int rejected) {}

  public BatchView createBatch(
      String ruleVersion, Map<String, Object> requested, String actor, Instant now) {
    String id = UUID.randomUUID().toString().replace("-", "").substring(0, 26);
    Timestamp timestamp = Timestamp.from(now);
    jdbc.update(
        """
        INSERT INTO content_import_batch
          (id, rule_version, status, requested_json, created_by, started_at)
        VALUES (?, ?, 'RUNNING', ?, ?, ?)
        """,
        id, ruleVersion, toJson(requested), actor, timestamp);
    return new BatchView(id, ruleVersion, "RUNNING", requested, now, null);
  }

  public AppendResult appendCandidates(
      String batchId, List<RawCandidate> candidates, String actor, Instant now) {
    return transactionTemplate.execute(status -> {
      // Check batch is RUNNING
      String batchStatus = jdbc.queryForObject(
          "SELECT status FROM content_import_batch WHERE id = ? FOR UPDATE",
          String.class, batchId);
      if (!"RUNNING".equals(batchStatus)) {
        int skipped = 0;
        for (var c : candidates) {
          writeCandidate(batchId, c, "SKIPPED_BATCH_CLOSED", null, now);
          skipped++;
        }
        return new AppendResult(0, skipped, 0);
      }

      int imported = 0;
      int skipped = 0;
      int rejected = 0;

      for (var candidate : candidates) {
        // Check if importKey already processed
        Integer existing = jdbc.queryForObject(
            "SELECT COUNT(*) FROM content_import_candidate WHERE batch_id = ? AND import_key = ?",
            Integer.class, batchId, candidate.importKey());
        if (existing != null && existing > 0) {
          skipped++;
          continue;
        }

        // Check if content item already exists
        Optional<com.childedu.chinese.content.domain.ContentItemView> existingItem =
            repository.find(candidate.id());
        if (existingItem.isPresent()) {
          var item = existingItem.get();
          String reason = item.status() == ContentStatus.ACTIVE || item.status() == ContentStatus.ARCHIVED
              ? "SKIPPED_EXISTING_" + item.status()
              : "SKIPPED_EXISTING_ID";
          writeCandidate(batchId, candidate, reason, null, now);
          skipped++;
          continue;
        }

        // Validate and create
        try {
          ContentType type = ContentType.valueOf(candidate.contentType());
          ContentLevel level = ContentLevel.fromValue(candidate.suggestedLevel());
          ContentLevel difficulty = ContentLevel.fromValue(candidate.suggestedDifficulty());
          JsonNode payload = objectMapper.valueToTree(candidate.payload());
          ContentDraft draft = new ContentDraft(
              candidate.id(), type, level, difficulty,
              candidate.promotionRequired(), List.of(), payload);

          repository.create(draft, actor, now);
          writeCandidate(batchId, candidate, "IMPORTED", candidate.id(), now);
          imported++;
        } catch (Exception e) {
          writeCandidate(batchId, candidate, "REJECTED", null, now);
          rejected++;
        }
      }

      return new AppendResult(imported, skipped, rejected);
    });
  }

  public BatchView completeBatch(String batchId, String actor, Instant now) {
    Timestamp timestamp = Timestamp.from(now);
    var counts = jdbc.queryForMap(
        """
        SELECT
          SUM(CASE WHEN decision = 'IMPORTED' THEN 1 ELSE 0 END) AS imported,
          SUM(CASE WHEN decision LIKE 'SKIPPED%' THEN 1 ELSE 0 END) AS skipped,
          SUM(CASE WHEN decision = 'REJECTED' THEN 1 ELSE 0 END) AS rejected
        FROM content_import_candidate
        WHERE batch_id = ?
        """, batchId);

    long imported = 0;
    long skipped = 0;
    long rejected = 0;
    if (counts != null) {
      imported = counts.get("imported") instanceof Number n ? n.longValue() : 0L;
      skipped = counts.get("skipped") instanceof Number n ? n.longValue() : 0L;
      rejected = counts.get("rejected") instanceof Number n ? n.longValue() : 0L;
    }

    String resultJson = toJson(Map.of(
        "imported", imported,
        "skipped", skipped,
        "rejected", rejected));

    jdbc.update(
        """
        UPDATE content_import_batch
        SET status = 'COMPLETED', result_json = ?, completed_at = ?
        WHERE id = ?
        """, resultJson, timestamp, batchId);

    return findBatch(batchId);
  }

  public BatchView findBatch(String batchId) {
    return jdbc.queryForObject(
        """
        SELECT id, rule_version, status, requested_json, started_at, completed_at
        FROM content_import_batch WHERE id = ?
        """,
        (rs, rowNum) -> new BatchView(
            rs.getString("id"),
            rs.getString("rule_version"),
            rs.getString("status"),
            parseJson(rs.getString("requested_json")),
            rs.getTimestamp("started_at").toInstant(),
            rs.getTimestamp("completed_at") != null
                ? rs.getTimestamp("completed_at").toInstant() : null),
        batchId);
  }

  private void writeCandidate(
      String batchId, RawCandidate candidate, String decision, String itemId, Instant now) {
    jdbc.update(
        """
        INSERT INTO content_import_candidate
          (batch_id, import_key, item_id, content_type, source_name,
           source_ref, source_hash, decision, reason_code, score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        batchId, candidate.importKey(), itemId, candidate.contentType(),
        candidate.sourceName(), candidate.sourceRef(), candidate.sourceHash(),
        decision, decision, (int) Math.round(candidate.score()),
        Timestamp.from(now));
  }

  private String toJson(Object obj) {
    try {
      return objectMapper.writeValueAsString(obj);
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("cannot serialize", e);
    }
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> parseJson(String json) {
    try {
      return objectMapper.readValue(json, Map.class);
    } catch (JsonProcessingException e) {
      return Map.of();
    }
  }
}