package com.childedu.chinese.learning.infrastructure;

import com.childedu.chinese.learning.domain.LearningEventInput;
import com.childedu.chinese.learning.domain.LearningEventType;
import com.childedu.chinese.learning.domain.StoredEvent;
import com.childedu.chinese.shared.ChildProfileId;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

/** 批量事件写入（JdbcTemplate），event_id 唯一约束保证幂等。 */
public class JdbcLearningEventRepository {

  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper = new ObjectMapper();

  public JdbcLearningEventRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** 尝试插入单条；返回 true=已插入，false=唯一键冲突（重复）。 */
  public boolean tryInsert(LearningEventInput e) {
    try {
      jdbc.update(
          """
          INSERT INTO learning_event
            (event_id, child_profile_id, device_id, session_id, event_type, client_sequence,
             content_version, rule_version, occurred_at, received_at, payload_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
          """,
          e.eventId(),
          e.childProfileId().value(),
          e.deviceId(),
          e.sessionId(),
          e.eventType().name(),
          e.clientSequence(),
          e.contentVersion(),
          e.ruleVersion(),
          e.occurredAt(),
          Timestamp.from(Instant.now()),
          toJson(e.payload()));
      return true;
    } catch (DuplicateKeyException dup) {
      return false;
    }
  }

  public long maxServerOffset() {
    Long v = jdbc.queryForObject("SELECT COALESCE(MAX(server_offset),0) FROM learning_event", Long.class);
    return v == null ? 0 : v;
  }

  public List<StoredEvent> pull(long cursor, int limit) {
    return jdbc.query(
        """
        SELECT event_id, child_profile_id, device_id, session_id, event_type, client_sequence,
               content_version, rule_version, occurred_at, server_offset, payload_json
        FROM learning_event
        WHERE server_offset > ?
        ORDER BY server_offset ASC
        LIMIT ?
        """,
        (rs, i) ->
            new StoredEvent(
                rs.getString("event_id"),
                new ChildProfileId(rs.getString("child_profile_id")),
                rs.getString("device_id"),
                rs.getString("session_id"),
                LearningEventType.valueOf(rs.getString("event_type")),
                rs.getLong("client_sequence"),
                rs.getString("content_version"),
                rs.getString("rule_version"),
                rs.getLong("occurred_at"),
                rs.getLong("server_offset"),
                fromJson(rs.getString("payload_json"))),
        cursor,
        limit);
  }

  private String toJson(java.util.Map<String, Object> payload) {
    try {
      return mapper.writeValueAsString(payload);
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("bad payload", e);
    }
  }

  @SuppressWarnings("unchecked")
  private java.util.Map<String, Object> fromJson(String json) {
    try {
      return mapper.readValue(json, java.util.Map.class);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("corrupt payload", e);
    }
  }

  static List<String> emptyList() {
    return new ArrayList<>();
  }
}
