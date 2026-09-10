package com.childedu.chinese.operations.domain;

import java.util.List;

/** Outbox 端口。lockNextBatch 使用 FOR UPDATE SKIP LOCKED 竞争消费。 */
public interface OutboxRepository {
  void enqueue(String aggregateType, String aggregateId, String eventType, String payloadJson);

  List<OutboxRecord> lockNextBatch(int limit);

  void markDone(long id);

  void markFailed(long id, String error);

  OutboxBacklog backlog();
}
