package com.childedu.chinese.operations.application;

import com.childedu.chinese.operations.domain.OutboxRecord;
import com.childedu.chinese.operations.domain.OutboxRepository;
import com.childedu.chinese.shared.metrics.BusinessMetrics;
import java.util.List;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 定时排空 Outbox：锁一批 → 逐条 handle → 成功 markDone / 异常 markFailed（多实例安全）。 */
@Component
public class OutboxWorker {

  private final OutboxRepository repository;
  private final OutboxHandler handler;
  private final BusinessMetrics metrics;

  public OutboxWorker(
      OutboxRepository repository, OutboxHandler handler, BusinessMetrics metrics) {
    this.repository = repository;
    this.handler = handler;
    this.metrics = metrics;
  }

  /** 单轮排空，返回本轮尝试处理的记录数。 */
  public int drainOnce(int batchSize) {
    List<OutboxRecord> batch = repository.lockNextBatch(batchSize);
    for (OutboxRecord record : batch) {
      try {
        handler.handle(record);
        repository.markDone(record.id());
      } catch (RuntimeException e) {
        repository.markFailed(record.id(), String.valueOf(e.getMessage()));
      }
    }
    var backlog = repository.backlog();
    metrics.outboxBacklog(backlog.pendingCount());
    metrics.outboxOldestAge(backlog.oldestPendingAge());
    return batch.size();
  }

  /** 生产周期由 application.yml 的 childedu.outbox.poll-interval-ms 配置（默认 2s）。 */
  @Scheduled(fixedDelayString = "${childedu.outbox.poll-interval-ms:2000}")
  public void poll() {
    drainOnce(100);
  }
}
