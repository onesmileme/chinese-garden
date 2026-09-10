package com.childedu.chinese.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.identity.infrastructure.WeappPlatformGateway;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class WeappPlatformGatewayTest {

  private MockWebServer server;

  @BeforeEach
  void start() throws Exception {
    server = new MockWebServer();
    server.start();
  }

  @AfterEach
  void stop() throws Exception {
    server.shutdown();
  }

  @Test
  void exchangesCodeForOpenId() {
    server.enqueue(
        new MockResponse()
            .setHeader("Content-Type", "application/json")
            .setBody("{\"openid\":\"wx-open-123\",\"session_key\":\"sk\"}"));

    WeappPlatformGateway gateway =
        new WeappPlatformGateway(server.url("/").toString(), "appid", "secret");
    String externalUserId = gateway.exchangeExternalUserId("appid", "the-code");

    assertThat(externalUserId).isEqualTo("wx-open-123");
  }
}
