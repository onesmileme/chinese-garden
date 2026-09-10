package com.childedu.chinese.operations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.childedu.chinese.operations.application.OutboxHandler;
import com.childedu.chinese.operations.application.OutboxWorker;
import com.childedu.chinese.operations.domain.OutboxBacklog;
import com.childedu.chinese.operations.domain.OutboxRecord;
import com.childedu.chinese.operations.domain.OutboxRepository;
import com.childedu.chinese.shared.metrics.BusinessMetrics;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class OutboxWorkerTest {

  static OutboxRecord rec(long id, String type) {
    return new OutboxRecord(
        id, "learning_event", "01ARZ3NDEKTSV4RRFFQ69G5AA1", type, "{\"score\":40}", 0, "PENDING");
  }

  @Test
  void handlesEachRecordAndMarksDone() {
    OutboxRepository repo = mock(OutboxRepository.class);
    OutboxHandler handler = mock(OutboxHandler.class);
    BusinessMetrics metrics = mock(BusinessMetrics.class);
    when(repo.lockNextBatch(anyInt()))
        .thenReturn(List.of(rec(1, "MASTERY_CHANGED"), rec(2, "PROGRESSION_CHANGED")));
    when(repo.backlog()).thenReturn(new OutboxBacklog(3, Duration.ofSeconds(8)));

    OutboxWorker worker = new OutboxWorker(repo, handler, metrics);
    int processed = worker.drainOnce(10);

    assertThat(processed).isEqualTo(2);
    verify(handler, times(2)).handle(org.mockito.ArgumentMatchers.any());
    verify(repo).markDone(1L);
    verify(repo).markDone(2L);
    verify(metrics).outboxBacklog(3);
    verify(metrics).outboxOldestAge(Duration.ofSeconds(8));
  }

  @Test
  void marksFailedWhenHandlerThrowsAndContinuesRestOfBatch() {
    OutboxRepository repo = mock(OutboxRepository.class);
    OutboxHandler handler = mock(OutboxHandler.class);
    BusinessMetrics metrics = mock(BusinessMetrics.class);
    OutboxRecord bad = rec(1, "MASTERY_CHANGED");
    OutboxRecord good = rec(2, "PROGRESSION_CHANGED");
    when(repo.lockNextBatch(anyInt())).thenReturn(List.of(bad, good));
    when(repo.backlog()).thenReturn(new OutboxBacklog(1, Duration.ZERO));
    doThrow(new RuntimeException("projector down")).when(handler).handle(bad);

    OutboxWorker worker = new OutboxWorker(repo, handler, metrics);
    int processed = worker.drainOnce(10);

    assertThat(processed).isEqualTo(2);
    verify(repo).markFailed(eq(1L), contains("projector down"));
    verify(repo).markDone(2L);
    verify(repo, times(0)).markDone(1L);
    verify(metrics).outboxBacklog(1);
    verify(metrics).outboxOldestAge(Duration.ZERO);
  }

  @Test
  void returnsZeroWhenNothingPending() {
    OutboxRepository repo = mock(OutboxRepository.class);
    OutboxHandler handler = mock(OutboxHandler.class);
    BusinessMetrics metrics = mock(BusinessMetrics.class);
    when(repo.lockNextBatch(anyInt())).thenReturn(List.of());
    when(repo.backlog()).thenReturn(new OutboxBacklog(0, Duration.ZERO));

    OutboxWorker worker = new OutboxWorker(repo, handler, metrics);
    assertThat(worker.drainOnce(10)).isZero();
    verify(metrics).outboxBacklog(0);
    verify(metrics).outboxOldestAge(Duration.ZERO);
  }
}
