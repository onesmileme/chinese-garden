package com.childedu.chinese.app;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.learning.application.LearningEventAppender;
import com.childedu.chinese.learning.domain.AppendOutcome;
import com.childedu.chinese.learning.domain.LearningEventInput;
import com.childedu.chinese.learning.domain.LearningEventType;
import com.childedu.chinese.learning.domain.StoredEvent;
import com.childedu.chinese.operations.domain.OutboxRepository;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.sync.api.PullResponse;
import com.childedu.chinese.sync.api.PushRequest;
import com.childedu.chinese.sync.api.PushResponse;
import com.childedu.chinese.sync.application.SyncService;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
class SyncScenariosIT {

  @DynamicPropertySource
  static void datasource(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", MySqlContainerSupport::jdbcUrl);
    registry.add("spring.datasource.username", MySqlContainerSupport::username);
    registry.add("spring.datasource.password", MySqlContainerSupport::password);
  }

  @Autowired SyncService syncService;
  @Autowired LearningEventAppender appender;
  @Autowired OutboxRepository outboxRepository;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void clean() {
    jdbc.update("DELETE FROM learning_event");
    jdbc.update("DELETE FROM outbox_event");
  }

  static LearningEventInput ev(String id, String device, long seq) {
    return new LearningEventInput(
        id,
        new ChildProfileId("c1"),
        device,
        "s1",
        LearningEventType.LESSON_ANSWER,
        seq,
        "corpus-v1",
        "mastery-v1",
        1_700_000_000_000L + seq,
        Map.of(
            "knowledgePointId", "cy-madaochenggong",
            "questionType", "IDIOM_MEANING",
            "chosenAnswer", "事情顺利，很快取得成功"));
  }

  @Test
  void duplicateBatchDoesNotDoubleCount() {
    PushRequest batch =
        new PushRequest(
            List.of(
                ev("01ARZ3NDEKTSV4RRFFQ69G5C01", "devA", 1),
                ev("01ARZ3NDEKTSV4RRFFQ69G5C02", "devA", 2)));
    PushResponse first = syncService.push(batch);
    PushResponse replay = syncService.push(batch);

    assertThat(first.accepted()).hasSize(2);
    assertThat(replay.accepted()).isEmpty();
    assertThat(replay.duplicated()).hasSize(2);
    Long rows = jdbc.queryForObject("SELECT COUNT(*) FROM learning_event", Long.class);
    assertThat(rows).isEqualTo(2L);
  }

  @Test
  void multiDeviceOutOfOrderYieldsSameCanonicalOrder() {
    syncService.push(
        new PushRequest(List.of(ev("01ARZ3NDEKTSV4RRFFQ69G5C22", "devA", 2))));
    syncService.push(
        new PushRequest(List.of(ev("01ARZ3NDEKTSV4RRFFQ69G5C11", "devB", 1))));

    PullResponse all = syncService.pull(0, 100);
    List<StoredEvent> events = all.events();
    assertThat(events).hasSize(2);
    assertThat(events.get(0).serverOffset()).isLessThan(events.get(1).serverOffset());
    assertThat(all.nextCursor()).isEqualTo(events.get(1).serverOffset());
  }

  @Test
  void retryAfterLostResponseIsIdempotent() {
    LearningEventInput e = ev("01ARZ3NDEKTSV4RRFFQ69G5C31", "devA", 1);
    AppendOutcome once = appender.appendBatch(List.of(e));
    AppendOutcome retry = appender.appendBatch(List.of(e));

    assertThat(once.accepted()).containsExactly("01ARZ3NDEKTSV4RRFFQ69G5C31");
    assertThat(retry.accepted()).isEmpty();
    assertThat(retry.duplicated()).containsExactly("01ARZ3NDEKTSV4RRFFQ69G5C31");
    assertThat(retry.serverOffset()).isEqualTo(once.serverOffset());
  }

  @Test
  void projectionRecoversFromOutboxAfterCrash() {
    outboxRepository.enqueue(
        "learning_event", "01ARZ3NDEKTSV4RRFFQ69G5C41", "MASTERY_CHANGED", "{\"score\":40}");
    assertThat(outboxRepository.lockNextBatch(10)).hasSize(1);
    assertThat(outboxRepository.lockNextBatch(10)).hasSize(1);
  }

  @Test
  void contentVersionSwitchKeepsInFlightEvents() {
    syncService.push(
        new PushRequest(
            List.of(
                new LearningEventInput(
                    "01ARZ3NDEKTSV4RRFFQ69G5C51",
                    new ChildProfileId("c1"),
                    "devA",
                    "s1",
                    LearningEventType.LESSON_ANSWER,
                    1,
                    "corpus-v1",
                    "mastery-v1",
                    1_700_000_000_000L,
                    Map.of(
                        "knowledgePointId",
                        "cy-madaochenggong",
                        "questionType",
                        "IDIOM_MEANING",
                        "chosenAnswer",
                        "事情顺利，很快取得成功")))));
    syncService.push(
        new PushRequest(
            List.of(
                new LearningEventInput(
                    "01ARZ3NDEKTSV4RRFFQ69G5C52",
                    new ChildProfileId("c1"),
                    "devA",
                    "s1",
                    LearningEventType.LESSON_ANSWER,
                    2,
                    "corpus-v2",
                    "mastery-v1",
                    1_700_000_000_100L,
                    Map.of(
                        "knowledgePointId",
                        "cy-gongshigongban",
                        "questionType",
                        "IDIOM_CHAIN",
                        "chosenAnswer",
                        "公事公办")))));

    PullResponse all = syncService.pull(0, 100);
    assertThat(all.events())
        .extracting(StoredEvent::contentVersion)
        .containsExactly("corpus-v1", "corpus-v2");
  }
}
