package com.childedu.chinese.sync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.childedu.chinese.learning.application.LearningEventAppender;
import com.childedu.chinese.learning.domain.AppendOutcome;
import com.childedu.chinese.learning.domain.LearningEventInput;
import com.childedu.chinese.learning.domain.LearningEventType;
import com.childedu.chinese.learning.domain.StoredEvent;
import com.childedu.chinese.shared.ChildProfileId;
import com.childedu.chinese.sync.api.PullResponse;
import com.childedu.chinese.sync.api.PushRequest;
import com.childedu.chinese.sync.api.PushResponse;
import com.childedu.chinese.sync.application.SyncService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SyncServiceTest {

  static LearningEventInput input(String id, long seq) {
    return new LearningEventInput(
        id, new ChildProfileId("c1"), "dev1", "s1", LearningEventType.LESSON_ANSWER,
        seq, "2026.01", "mastery-v1", 1_700_000_000_000L + seq,
        Map.of(
            "knowledgePointId", "cy-madaochenggong",
            "questionType", "IDIOM_MEANING",
            "chosenAnswer", "事情顺利，很快取得成功"));
  }

  static StoredEvent stored(String id, long offset) {
    return new StoredEvent(
        id, new ChildProfileId("c1"), "dev1", "s1", LearningEventType.LESSON_ANSWER,
        offset, "2026.01", "mastery-v1", 1_700_000_000_000L + offset, offset,
        Map.of(
            "knowledgePointId", "cy-madaochenggong",
            "questionType", "IDIOM_MEANING",
            "chosenAnswer", "事情顺利，很快取得成功"));
  }

  @Test
  void pushForwardsToAppenderAndMapsOutcome() {
    LearningEventAppender appender = mock(LearningEventAppender.class);
    when(appender.appendBatch(anyList()))
        .thenReturn(new AppendOutcome(List.of("a1"), List.of("d1"), List.of("r1"), 42L));

    SyncService svc = new SyncService(appender);
    PushResponse resp = svc.push(new PushRequest(List.of(input("01ARZ3NDEKTSV4RRFFQ69G5AA1", 1))));

    assertThat(resp.accepted()).containsExactly("a1");
    assertThat(resp.duplicated()).containsExactly("d1");
    assertThat(resp.rejected()).containsExactly("r1");
    assertThat(resp.serverOffset()).isEqualTo(42L);
  }

  @Test
  void pullReturnsEventsAndAdvancesCursorToLastOffset() {
    LearningEventAppender appender = mock(LearningEventAppender.class);
    when(appender.pull(eq(10L), anyInt()))
        .thenReturn(List.of(stored("01ARZ3NDEKTSV4RRFFQ69G5AA1", 11L),
                            stored("01ARZ3NDEKTSV4RRFFQ69G5AA2", 12L)));

    SyncService svc = new SyncService(appender);
    PullResponse resp = svc.pull(10L, 100);

    assertThat(resp.events()).hasSize(2);
    assertThat(resp.nextCursor()).isEqualTo(12L); // 最后一个事件的 server_offset
  }

  @Test
  void pullWithEmptyBatchKeepsCursor() {
    LearningEventAppender appender = mock(LearningEventAppender.class);
    when(appender.pull(anyLong(), anyInt())).thenReturn(List.of());

    SyncService svc = new SyncService(appender);
    PullResponse resp = svc.pull(99L, 100);

    assertThat(resp.events()).isEmpty();
    assertThat(resp.nextCursor()).isEqualTo(99L); // 空批不倒退
  }
}
