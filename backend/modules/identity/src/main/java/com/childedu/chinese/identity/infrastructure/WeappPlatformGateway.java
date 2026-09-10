package com.childedu.chinese.identity.infrastructure;

import com.childedu.chinese.identity.domain.PlatformGateway;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/** 微信 code2session 网关（密钥仅存后端，spec §19）。 */
public class WeappPlatformGateway implements PlatformGateway {

  private final String baseUrl;
  private final String appId;
  private final String secret;
  private final HttpClient http = HttpClient.newHttpClient();
  private final ObjectMapper mapper = new ObjectMapper();

  public WeappPlatformGateway(String baseUrl, String appId, String secret) {
    this.baseUrl = baseUrl;
    this.appId = appId;
    this.secret = secret;
  }

  @Override
  public String exchangeExternalUserId(String platformAppId, String code) {
    try {
      URI uri =
          URI.create(
              baseUrl
                  + "sns/jscode2session?appid="
                  + appId
                  + "&secret="
                  + secret
                  + "&js_code="
                  + code
                  + "&grant_type=authorization_code");
      HttpResponse<String> resp =
          http.send(
              HttpRequest.newBuilder(uri).GET().build(), HttpResponse.BodyHandlers.ofString());
      JsonNode node = mapper.readTree(resp.body());
      if (!node.has("openid")) {
        throw new IllegalStateException("platform login failed");
      }
      return node.get("openid").asText();
    } catch (java.io.IOException | InterruptedException e) {
      if (e instanceof InterruptedException) {
        Thread.currentThread().interrupt();
      }
      throw new IllegalStateException("platform login error", e);
    }
  }
}
