package com.childedu.chinese.operations.infrastructure;

import com.childedu.chinese.operations.application.AuditLog;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;

public class JdbcAuditLog implements AuditLog {

  private final JdbcTemplate jdbc;

  public JdbcAuditLog(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public void record(
      String actor,
      String action,
      String target,
      JsonNode before,
      JsonNode after,
      String reason,
      boolean success,
      Instant at) {
    jdbc.update(
        """
        INSERT INTO admin_audit_log
          (actor, action, target, before_json, after_json, reason, success, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        actor,
        action,
        target,
        jsonOrNull(before),
        jsonOrNull(after),
        truncate(reason, 512),
        success,
        Timestamp.from(at));
  }

  private static String jsonOrNull(JsonNode value) {
    return value == null || value.isNull() ? null : value.toString();
  }

  private static String truncate(String value, int maxLength) {
    return value == null || value.length() <= maxLength ? value : value.substring(0, maxLength);
  }
}
