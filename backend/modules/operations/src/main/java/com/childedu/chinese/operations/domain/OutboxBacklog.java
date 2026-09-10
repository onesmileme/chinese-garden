package com.childedu.chinese.operations.domain;

import java.time.Duration;
import java.util.Objects;

/** Current pending Outbox volume and the age of its oldest pending record. */
public record OutboxBacklog(int pendingCount, Duration oldestPendingAge) {

  public OutboxBacklog {
    if (pendingCount < 0) {
      throw new IllegalArgumentException("pendingCount must not be negative");
    }
    oldestPendingAge = Objects.requireNonNull(oldestPendingAge, "oldestPendingAge");
    if (oldestPendingAge.isNegative()) {
      oldestPendingAge = Duration.ZERO;
    }
  }
}
