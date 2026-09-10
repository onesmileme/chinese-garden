package com.childedu.chinese.operations;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.operations.domain.OutboxRecord;
import com.childedu.chinese.operations.infrastructure.JdbcOutboxRepository;
import com.childedu.chinese.testsupport.MigrationSupport;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import java.time.Duration;
import java.util.List;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

class JdbcOutboxRepositoryIT {

  static DataSource dataSource;
  static JdbcTemplate jdbc;
  static TransactionTemplate tx;

  @BeforeAll
  static void migrate() {
    DriverManagerDataSource ds = new DriverManagerDataSource();
    ds.setUrl(MySqlContainerSupport.jdbcUrl());
    ds.setUsername(MySqlContainerSupport.username());
    ds.setPassword(MySqlContainerSupport.password());
    dataSource = ds;
    jdbc = new JdbcTemplate(ds);
    tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
    Flyway.configure().dataSource(ds).locations(MigrationSupport.location()).load().migrate();
  }

  @BeforeEach
  void clean() {
    jdbc.update("DELETE FROM outbox_event");
  }

  @Test
  void enqueueThenLockThenMarkDoneRemovesFromPending() {
    JdbcOutboxRepository repo = new JdbcOutboxRepository(jdbc, tx);
    repo.enqueue("learning_event", "01ARZ3NDEKTSV4RRFFQ69G5AA1", "MASTERY_CHANGED", "{\"score\":40}");

    List<OutboxRecord> batch = repo.lockNextBatch(10);
    assertThat(batch).hasSize(1);
    assertThat(batch.get(0).status()).isEqualTo("PENDING");

    repo.markDone(batch.get(0).id());
    assertThat(repo.lockNextBatch(10)).isEmpty();
  }

  @Test
  void markFailedIncrementsAttemptsAndKeepsPending() {
    JdbcOutboxRepository repo = new JdbcOutboxRepository(jdbc, tx);
    repo.enqueue("learning_event", "01ARZ3NDEKTSV4RRFFQ69G5AA2", "PROGRESSION_CHANGED", "{\"xp\":10}");

    OutboxRecord record = repo.lockNextBatch(10).get(0);
    repo.markFailed(record.id(), "boom");

    OutboxRecord again = repo.lockNextBatch(10).get(0);
    assertThat(again.attempts()).isEqualTo(1);
    assertThat(again.status()).isEqualTo("PENDING");
  }

  @Test
  void backlogUsesOnePendingAggregateAndReturnsZeroForAnEmptyQueue() {
    JdbcOutboxRepository repo = new JdbcOutboxRepository(jdbc, tx);

    assertThat(repo.backlog().pendingCount()).isZero();
    assertThat(repo.backlog().oldestPendingAge()).isEqualTo(Duration.ZERO);

    repo.enqueue("learning_event", "01ARZ3NDEKTSV4RRFFQ69G5AA3", "MASTERY_CHANGED", "{\"score\":50}");

    assertThat(repo.backlog().pendingCount()).isEqualTo(1);
    assertThat(repo.backlog().oldestPendingAge()).isGreaterThanOrEqualTo(Duration.ZERO);
  }
}
