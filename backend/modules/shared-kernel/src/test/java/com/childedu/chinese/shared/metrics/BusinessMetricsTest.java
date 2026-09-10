package com.childedu.chinese.shared.metrics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import org.junit.jupiter.api.Test;

class BusinessMetricsTest {

  @Test
  void countersUseStableNamesAndTags() {
    var registry = new SimpleMeterRegistry();
    var metrics = new BusinessMetrics(registry);

    metrics.loginFailed("WECHAT");
    metrics.syncRejected(2);
    metrics.outboxBacklog(7);
    metrics.outboxOldestAge(Duration.ofSeconds(12));
    metrics.contentValidationFailed("SCHEMA");
    metrics.contentRegistrationFailed();
    metrics.questionValidationFailed();

    assertThat(registry.get("childedu.login.failed").tag("platform", "WECHAT").counter().count())
        .isEqualTo(1);
    assertThat(registry.get("childedu.sync.rejected").counter().count()).isEqualTo(2);
    assertThat(registry.get("childedu.outbox.backlog").gauge().value()).isEqualTo(7);
    assertThat(registry.get("childedu.outbox.oldest.age").gauge().value()).isEqualTo(12);
    assertThat(
            registry
                .get("childedu.content.validation.failed")
                .tag("stage", "SCHEMA")
                .counter()
                .count())
        .isEqualTo(1);
    assertThat(registry.get("childedu.content.registration.failed").counter().count()).isEqualTo(1);
    assertThat(registry.get("childedu.question.validation.failed").counter().count()).isEqualTo(1);
  }

  @Test
  void projectionTimerRecordsThrownAndSuccessfulBodies() {
    var registry = new SimpleMeterRegistry();
    var metrics = new BusinessMetrics(registry);

    assertThat(metrics.recordProjection(() -> "done")).isEqualTo("done");
    assertThatThrownBy(
            () ->
                metrics.recordProjection(
                    () -> {
                      throw new IllegalStateException("boom");
                    }))
        .isInstanceOf(IllegalStateException.class);

    assertThat(registry.get("childedu.projection.latency").timer().count()).isEqualTo(2);
  }
}
