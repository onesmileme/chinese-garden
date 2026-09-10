package com.childedu.chinese.operations.application;

import com.childedu.chinese.operations.domain.OutboxRecord;

/**
 * Outbox 分发处理器。由投影器（mastery/progression）实现：按 eventType 重算对应投影，
 * 下游按 last_event_offset 幂等 upsert。
 */
@FunctionalInterface
public interface OutboxHandler {
  void handle(OutboxRecord record);
}
