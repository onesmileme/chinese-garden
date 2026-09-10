package com.childedu.chinese.learning;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.learning.application.LearningEventAppender;
import com.childedu.chinese.learning.domain.AppendOutcome;
import com.childedu.chinese.learning.domain.LearningEventInput;
import com.childedu.chinese.learning.domain.LearningEventType;
import com.childedu.chinese.learning.infrastructure.JdbcLearningEventRepository;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.testsupport.MigrationSupport;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class LearningEventAppenderIT {

  private static DataSource dataSource;

  @BeforeAll
  static void migrate() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource();
    dataSource.setUrl(MySqlContainerSupport.jdbcUrl());
    dataSource.setUsername(MySqlContainerSupport.username());
    dataSource.setPassword(MySqlContainerSupport.password());
    LearningEventAppenderIT.dataSource = dataSource;
    Flyway.configure().dataSource(dataSource).locations(MigrationSupport.location()).load().migrate();
  }

  private static LearningEventInput event(String id, long sequence) {
    return new LearningEventInput(
        id,
        new ChildProfileId("c1"),
        "dev1",
        "s1",
        LearningEventType.LESSON_ANSWER,
        sequence,
        "corpus-v1",
        "mastery-v1",
        1_700_000_000_000L + sequence,
        Map.of(
            "knowledgePointId", "cy-madaochenggong",
            "questionType", "IDIOM_MEANING",
            "chosenAnswer", "事情顺利，很快取得成功"));
  }

  @Test
  void appendsUniqueEventsAndDeduplicatesReplays() {
    LearningEventAppender appender =
        new LearningEventAppender(new JdbcLearningEventRepository(new JdbcTemplate(dataSource)));

    AppendOutcome first =
        appender.appendBatch(
            List.of(
                event("01ARZ3NDEKTSV4RRFFQ69G5AA1", 1), event("01ARZ3NDEKTSV4RRFFQ69G5AA2", 2)));
    assertThat(first.accepted()).hasSize(2);
    assertThat(first.duplicated()).isEmpty();
    assertThat(first.serverOffset()).isPositive();

    AppendOutcome replay =
        appender.appendBatch(
            List.of(
                event("01ARZ3NDEKTSV4RRFFQ69G5AA1", 1), event("01ARZ3NDEKTSV4RRFFQ69G5AA2", 2)));
    assertThat(replay.accepted()).isEmpty();
    assertThat(replay.duplicated()).hasSize(2);
  }

  @Test
  void rejectsBatchLargerThan100() {
    LearningEventAppender appender =
        new LearningEventAppender(new JdbcLearningEventRepository(new JdbcTemplate(dataSource)));
    List<LearningEventInput> events =
        java.util.stream.IntStream.range(0, 101)
            .mapToObj(i -> event("01ARZ3NDEKTSV4RRFFQ69G5B" + String.format("%02d", i), i))
            .toList();
    org.junit.jupiter.api.Assertions.assertThrows(
        IllegalArgumentException.class, () -> appender.appendBatch(events));
  }
}
