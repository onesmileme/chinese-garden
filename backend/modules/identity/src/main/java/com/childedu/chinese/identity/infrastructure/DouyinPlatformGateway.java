package com.childedu.chinese.identity.infrastructure;

import com.childedu.chinese.identity.domain.PlatformGateway;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/** 抖音小程序 code2Session 网关。AppSecret 只参与服务端到平台的请求。 */
public final class DouyinPlatformGateway implements PlatformGateway {

  private static final String CODE_TO_SESSION_PATH = "api/apps/v2/jscode2session";

  private final URI endpoint;
  private final String appId;
  private final String secret;
  private final HttpClient http = HttpClient.newHttpClient();
  private final ObjectMapper mapper = new ObjectMapper();

  public DouyinPlatformGateway(String baseUrl, String appId, String secret) {
    String normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    this.endpoint = URI.create(normalizedBaseUrl).resolve(CODE_TO_SESSION_PATH);
    this.appId = appId;
    this.secret = secret;
  }

  @Override
  public String exchangeExternalUserId(String platformAppId, String code) {
    if (!appId.equals(platformAppId)) {
      throw new IllegalArgumentException("platform app id mismatch");
    }
    try {
      String requestBody =
          mapper.writeValueAsString(
              mapper
                  .createObjectNode()
                  .put("appid", appId)
                  .put("secret", secret)
                  .put("code", code));
      HttpRequest request =
          HttpRequest.newBuilder(endpoint)
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(requestBody))
              .build();
      HttpResponse<String> response =
          http.send(request, HttpResponse.BodyHandlers.ofString());
      JsonNode body = mapper.readTree(response.body());
      JsonNode openId = body.path("data").path("openid");
      if (response.statusCode() / 100 != 2
          || body.path("err_no").asLong(-1) != 0
          || !openId.isTextual()
          || openId.asText().isBlank()) {
        throw new IllegalStateException("platform login failed");
      }
      return openId.asText();
    } catch (java.io.IOException | InterruptedException error) {
      if (error instanceof InterruptedException) {
        Thread.currentThread().interrupt();
      }
      throw new IllegalStateException("platform login error", error);
    }
  }
}
