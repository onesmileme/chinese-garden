package com.childedu.chinese.shared.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/** Stable business-level metric names shared by the application modules. */
public class BusinessMetrics {

  private final MeterRegistry registry;
  private final Timer projectionLatency;
  private final AtomicLong outboxBacklog = new AtomicLong();
  private final AtomicLong outboxOldestAge = new AtomicLong();

  public BusinessMetrics(MeterRegistry registry) {
    this.registry = Objects.requireNonNull(registry, "registry");
    this.projectionLatency = registry.timer("childedu.projection.latency");
    registry.gauge("childedu.outbox.backlog", outboxBacklog);
    registry.gauge("childedu.outbox.oldest.age", outboxOldestAge);
  }

  public void loginFailed(String platform) {
    counter("childedu.login.failed", "platform", requiredTag(platform, "platform")).increment();
  }

  public void syncRejected(int count) {
    if (count <= 0) {
      return;
    }
    counter("childedu.sync.rejected").increment(count);
  }

  public <T> T recordProjection(Supplier<T> projection) {
    Timer.Sample sample = Timer.start(registry);
    try {
      return projection.get();
    } finally {
      sample.stop(projectionLatency);
    }
  }

  public void outboxBacklog(int pendingCount) {
    outboxBacklog.set(Math.max(0, pendingCount));
  }

  public void outboxOldestAge(Duration oldestPendingAge) {
    outboxOldestAge.set(Math.max(0, Objects.requireNonNull(oldestPendingAge).toSeconds()));
  }

  public void contentValidationFailed(String stage) {
    counter(
            "childedu.content.validation.failed",
            "stage",
            requiredTag(stage, "stage"))
        .increment();
  }

  public void contentRegistrationFailed() {
    counter("childedu.content.registration.failed").increment();
  }

  public void questionValidationFailed() {
    counter("childedu.question.validation.failed").increment();
  }

  private Counter counter(String name, String... tags) {
    return registry.counter(name, tags);
  }

  private static String requiredTag(String value, String name) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(name + " must not be blank");
    }
    return value;
  }
}
