package com.childedu.chinese.operations.infrastructure;

import com.childedu.chinese.operations.domain.OutboxRecord;
import com.childedu.chinese.operations.domain.OutboxRepository;
import com.childedu.chinese.operations.domain.OutboxBacklog;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Outbox JDBC 实现。lockNextBatch 在事务内用 FOR UPDATE SKIP LOCKED 领取待办，
 * 已被其他实例锁住的行自动跳过，实现天然竞争消费。
 */
@Repository
public class JdbcOutboxRepository implements OutboxRepository {

  private final JdbcTemplate jdbc;
  private final TransactionTemplate tx;

  public JdbcOutboxRepository(JdbcTemplate jdbc, TransactionTemplate tx) {
    this.jdbc = jdbc;
    this.tx = tx;
  }

  @Override
  public void enqueue(
      String aggregateType, String aggregateId, String eventType, String payloadJson) {
    Timestamp now = Timestamp.from(Instant.now());
    jdbc.update(
        """
        INSERT INTO outbox_event
          (aggregate_type, aggregate_id, event_type, payload_json, status, attempts, created_at, updated_at)
        VALUES (?,?,?,?, 'PENDING', 0, ?, ?)
        """,
        aggregateType,
        aggregateId,
        eventType,
        payloadJson,
        now,
        now);
  }

  @Override
  public List<OutboxRecord> lockNextBatch(int limit) {
    return tx.execute(
        status ->
            jdbc.query(
                """
                SELECT id, aggregate_type, aggregate_id, event_type, payload_json, attempts, status
                FROM outbox_event
                WHERE status = 'PENDING'
                ORDER BY id ASC
                LIMIT ?
                FOR UPDATE SKIP LOCKED
                """,
                (rs, index) ->
                    new OutboxRecord(
                        rs.getLong("id"),
                        rs.getString("aggregate_type"),
                        rs.getString("aggregate_id"),
                        rs.getString("event_type"),
                        rs.getString("payload_json"),
                        rs.getInt("attempts"),
                        rs.getString("status")),
                limit));
  }

  @Override
  public void markDone(long id) {
    jdbc.update(
        "UPDATE outbox_event SET status = 'DONE', updated_at = ? WHERE id = ?",
        Timestamp.from(Instant.now()),
        id);
  }

  @Override
  public void markFailed(long id, String error) {
    String trimmed = error == null ? "" : (error.length() > 1024 ? error.substring(0, 1024) : error);
    jdbc.update(
        """
        UPDATE outbox_event
        SET status = 'PENDING', attempts = attempts + 1, last_error = ?, updated_at = ?
        WHERE id = ?
        """,
        trimmed,
        Timestamp.from(Instant.now()),
        id);
  }

  @Override
  public OutboxBacklog backlog() {
    return jdbc.queryForObject(
        """
        SELECT COUNT(*) AS pending_count, MIN(created_at) AS oldest_created_at
        FROM outbox_event
        WHERE status = 'PENDING'
        """,
        (rs, index) -> {
          int pendingCount = rs.getInt("pending_count");
          Timestamp oldestCreatedAt = rs.getTimestamp("oldest_created_at");
          if (pendingCount == 0 || oldestCreatedAt == null) {
            return new OutboxBacklog(0, Duration.ZERO);
          }
          Duration age = Duration.between(oldestCreatedAt.toInstant(), Instant.now());
          return new OutboxBacklog(pendingCount, age.isNegative() ? Duration.ZERO : age);
        });
  }
}
