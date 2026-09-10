package com.childedu.chinese.app;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.shared.metrics.BusinessMetrics;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "childedu.admin.token=metrics-test-token",
      "childedu.admin.allowed-ips=127.0.0.1",
      "management.endpoint.prometheus.enabled=true",
      "management.endpoints.web.exposure.include=health,info,prometheus"
    })
class PrometheusEndpointIT {

  @DynamicPropertySource
  static void datasource(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", MySqlContainerSupport::jdbcUrl);
    registry.add("spring.datasource.username", MySqlContainerSupport::username);
    registry.add("spring.datasource.password", MySqlContainerSupport::password);
  }

  @Autowired BusinessMetrics metrics;
  @Autowired TestRestTemplate rest;
  @LocalServerPort int port;

  @Test
  void exportsBusinessCountersFromThePrometheusEndpoint() {
    metrics.loginFailed("WECHAT");
    metrics.syncRejected(2);

    String endpoints = rest.getForObject("http://127.0.0.1:" + port + "/actuator", String.class);
    String body =
        rest.getForObject("http://127.0.0.1:" + port + "/actuator/prometheus", String.class);

    assertThat(endpoints).contains("\"prometheus\"");
    assertThat(body).contains("childedu_login_failed_total{platform=\"WECHAT\"} 1.0");
    assertThat(body).contains("childedu_sync_rejected_total 2.0");
  }
}
