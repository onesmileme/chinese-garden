package com.childedu.chinese.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.childedu.chinese.identity.infrastructure.DouyinPlatformGateway;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DouyinPlatformGatewayTest {

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
  void exchangesCodeForOpenIdUsingTheOfficialV2Contract() throws Exception {
    server.enqueue(
        new MockResponse()
            .setHeader("Content-Type", "application/json")
            .setBody(
                """
                {
                  "err_no": 0,
                  "err_tips": "success",
                  "data": {"openid": "douyin-open-123", "session_key": "secret-session"}
                }
                """));

    DouyinPlatformGateway gateway =
        new DouyinPlatformGateway(server.url("/").toString(), "douyin-app", "app-secret");

    assertThat(gateway.exchangeExternalUserId("douyin-app", "one-time-code"))
        .isEqualTo("douyin-open-123");
    RecordedRequest request = server.takeRequest();
    assertThat(request.getMethod()).isEqualTo("POST");
    assertThat(request.getPath()).isEqualTo("/api/apps/v2/jscode2session");
    assertThat(request.getHeader("Content-Type")).startsWith("application/json");
    assertThat(request.getBody().readUtf8())
        .isEqualTo(
            """
            {"appid":"douyin-app","secret":"app-secret","code":"one-time-code"}\
            """);
  }

  @Test
  void rejectsPlatformErrorsWithoutLeakingTheirPayload() {
    server.enqueue(
        new MockResponse()
            .setHeader("Content-Type", "application/json")
            .setBody("{\"err_no\":40015,\"err_tips\":\"invalid code\"}"));
    DouyinPlatformGateway gateway =
        new DouyinPlatformGateway(server.url("/").toString(), "douyin-app", "app-secret");

    assertThatThrownBy(
            () -> gateway.exchangeExternalUserId("douyin-app", "expired-code"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("platform login failed");
  }
}
