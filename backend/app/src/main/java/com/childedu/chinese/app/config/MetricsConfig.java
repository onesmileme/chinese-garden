package com.childedu.chinese.app.config;

import com.childedu.chinese.shared.metrics.BusinessMetrics;
import io.micrometer.core.instrument.Clock;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import org.springframework.boot.actuate.metrics.export.prometheus.PrometheusScrapeEndpoint;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Application wiring for domain-neutral business metrics. */
@Configuration
public class MetricsConfig {

  @Bean
  public Clock micrometerClock() {
    return Clock.SYSTEM;
  }

  @Bean
  @ConditionalOnMissingBean
  public PrometheusMeterRegistry prometheusMeterRegistry() {
    return new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
  }

  @Bean
  @ConditionalOnMissingBean(PrometheusScrapeEndpoint.class)
  public PrometheusScrapeEndpoint prometheusEndpoint(PrometheusMeterRegistry registry) {
    return new PrometheusScrapeEndpoint(
        registry.getPrometheusRegistry(), PrometheusConfig.DEFAULT.prometheusProperties());
  }

  @Bean
  public BusinessMetrics businessMetrics(MeterRegistry meterRegistry) {
    return new BusinessMetrics(meterRegistry);
  }
}
