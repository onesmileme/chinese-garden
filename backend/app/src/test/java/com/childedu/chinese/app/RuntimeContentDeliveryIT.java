package com.childedu.chinese.app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.childedu.chinese.identity.application.TokenService;
import com.childedu.chinese.shared.PrincipalId;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class RuntimeContentDeliveryIT {

  private static final String VERSION = "corpus-v6";
  private static final MockWebServer DOUYIN = startDouyin();

  @DynamicPropertySource
  static void datasource(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", MySqlContainerSupport::jdbcUrl);
    registry.add("spring.datasource.username", MySqlContainerSupport::username);
    registry.add("spring.datasource.password", MySqlContainerSupport::password);
    registry.add(
        "childedu.platform.douyin.base-url",
        () -> DOUYIN.url("/").toString());
    registry.add("childedu.platform.douyin.app-id", () -> "douyin-app");
    registry.add("childedu.platform.douyin.secret", () -> "douyin-secret");
    registry.add(
        "childedu.auth.allowed-origins",
        () -> "https://playground.test");
  }

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper json;

  @BeforeEach
  void cleanAndPublish() {
    jdbc.update("DELETE FROM refresh_session");
    jdbc.update("DELETE FROM principal_child");
    jdbc.update("DELETE FROM external_identity");
    jdbc.update("DELETE FROM progression_projection");
    jdbc.update("DELETE FROM child_profile");
    jdbc.update("DELETE FROM principal");
    jdbc.update("DELETE FROM content_release_artifact");
    jdbc.update("DELETE FROM content_release_item");
    jdbc.update("DELETE FROM content_release");
    jdbc.update("DELETE FROM content_revision");
    jdbc.update("DELETE FROM content_item");

    jdbc.update(
        """
        INSERT INTO content_release
          (version, rule_version, progression_rule_version,
           content_level_rule_version, min_client_version, status,
           created_at, published_at)
        VALUES (?, 'mastery-v1', 'progression-v1',
                'content-level-v1', '1.0.0', 'PUBLISHED',
                CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
        """,
        VERSION);
    for (int level = 1; level <= 5; level++) {
      jdbc.update(
          """
          INSERT INTO content_release_artifact
            (release_version, level, artifact_url, sha256,
             file_size, format, created_at)
          VALUES (?, ?, ?, ?, ?, 'tar+gzip', CURRENT_TIMESTAMP(3))
          """,
          VERSION,
          level,
          "https://cdn.test/" + VERSION + "/L" + level + ".tar.gz",
          Integer.toString(level).repeat(64),
          1000L + level);
    }
  }

  @Test
  void firstPlatformLoginCreatesAnL1ChildThatCanFetchItsManifest() throws Exception {
    JsonNode auth = platformLogin("first-login");

    manifest(auth, auth.path("defaultChildId").asText())
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(VERSION))
        .andExpect(jsonPath("$.abilityLevel").value(1))
        .andExpect(jsonPath("$.sha256").value("1".repeat(64)))
        .andExpect(jsonPath("$.format").value("tar+gzip"));
  }

  @Test
  void loginRepairsAnExistingPrincipalWithoutAChildProfile() throws Exception {
    jdbc.update(
        """
        INSERT INTO principal (id, status, created_at)
        VALUES ('existing-principal', 'ACTIVE', CURRENT_TIMESTAMP(3))
        """);
    jdbc.update(
        """
        INSERT INTO external_identity
          (principal_id, platform, platform_app_id, external_user_id, created_at)
        VALUES ('existing-principal', 'DOUYIN', 'douyin-app',
                'douyin-open-orphan', CURRENT_TIMESTAMP(3))
        """);

    JsonNode auth = platformLogin("orphan");

    assertThat(auth.path("principalId").asText()).isEqualTo("existing-principal");
    assertThat(auth.path("defaultChildId").asText()).isNotBlank();
    manifest(auth, auth.path("defaultChildId").asText())
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.abilityLevel").value(1));
  }

  @Test
  void promotionChangesOnlyTheNextManifestResolution() throws Exception {
    JsonNode auth = platformLogin("promoted-child");
    String childId = auth.path("defaultChildId").asText();

    manifest(auth, childId)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.abilityLevel").value(1));

    jdbc.update(
        """
        INSERT INTO progression_projection
          (child_profile_id, level, lifetime_xp, xp_into_level,
           rule_version, last_event_offset, updated_at)
        VALUES (?, 2, 100, 0, 'progression-v1', 1, CURRENT_TIMESTAMP(3))
        """,
        childId);

    manifest(auth, childId)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.abilityLevel").value(2))
        .andExpect(jsonPath("$.sha256").value("2".repeat(64)));
  }

  @Test
  void rejectsAChildOwnedByAnotherPrincipal() throws Exception {
    JsonNode auth = platformLogin("guardian-1");

    manifest(auth, "unrelated-child").andExpect(status().isForbidden());
  }

  @Test
  void refreshRecoversFromExpiredAccessAndRejectsReplay() throws Exception {
    JsonNode auth = platformLogin("refresh-owner");
    String expiredAccess =
        new TokenService(
                "0123456789abcdef0123456789abcdef"
                    .getBytes(StandardCharsets.UTF_8),
                () -> Instant.parse("2020-01-01T00:00:00Z"))
            .issueAccess(new PrincipalId(auth.path("principalId").asText()));

    manifestWithAccess(expiredAccess, auth.path("defaultChildId").asText())
        .andExpect(status().isUnauthorized());

    String refreshBody =
        mvc.perform(
                post("/v1/auth/refresh")
                    .contentType("application/json")
                    .content(
                        json.createObjectNode()
                            .put("refreshToken", auth.path("refreshToken").asText())
                            .toString()))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8);
    JsonNode refreshed = json.readTree(refreshBody);
    manifest(refreshed, auth.path("defaultChildId").asText())
        .andExpect(status().isOk());

    mvc.perform(
            post("/v1/auth/refresh")
                .contentType("application/json")
                .content(
                    json.createObjectNode()
                        .put("refreshToken", auth.path("refreshToken").asText())
                        .toString()))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void reportsManifestUnavailableWhenTheLevelHasNoPublishedArtifact()
      throws Exception {
    JsonNode auth = platformLogin("no-artifact");
    jdbc.update(
        "DELETE FROM content_release_artifact WHERE release_version = ? AND level = 1",
        VERSION);

    manifest(auth, auth.path("defaultChildId").asText())
        .andExpect(status().isNotFound());
  }

  @Test
  void allowsOnlyConfiguredBrowserOriginsForClientApis() throws Exception {
    mvc.perform(
            options("/v1/auth/platform-login")
                .header("Origin", "https://playground.test")
                .header("Access-Control-Request-Method", "POST"))
        .andExpect(status().isOk())
        .andExpect(
            header().string(
                "Access-Control-Allow-Origin", "https://playground.test"));

    mvc.perform(
            options("/v1/content/manifest")
                .header("Origin", "https://untrusted.test")
                .header("Access-Control-Request-Method", "GET"))
        .andExpect(status().isForbidden())
        .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
  }

  @Test
  void publishedSnapshotKeepsItsCapturedRevisionAfterCatalogChanges()
      throws Exception {
    jdbc.update("DELETE FROM content_release_artifact");
    jdbc.update("DELETE FROM content_release");
    jdbc.update(
        """
        INSERT INTO content_item
          (id, type, status, current_revision, created_at, updated_at)
        VALUES ('hz-yue', 'CHARACTER', 'ACTIVE', 1,
                CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
        """);
    jdbc.update(
        """
        INSERT INTO content_revision
          (item_id, revision, level, difficulty, promotion_required,
           tags_json, payload_json, created_by, created_at)
        VALUES ('hz-yue', 1, 1, 1, FALSE, JSON_ARRAY('nature'),
                JSON_OBJECT('char', '月'), 'reviewer', CURRENT_TIMESTAMP(3))
        """);

    mvc.perform(
            post("/v1/admin/content/releases/snapshots")
                .with(
                    request -> {
                      request.setRemoteAddr("127.0.0.1");
                      return request;
                    })
                .header("X-Admin-Token", "test-admin-token")
                .contentType("application/json")
                .content(
                    """
                    {
                      "version":"corpus-snapshot-v1",
                      "masteryRuleVersion":"mastery-v1",
                      "progressionRuleVersion":"progression-v1",
                      "contentLevelRuleVersion":"content-level-v1",
                      "minClientVersion":"1.0.0"
                    }
                    """))
        .andExpect(status().isCreated());

    jdbc.update(
        """
        INSERT INTO content_revision
          (item_id, revision, level, difficulty, promotion_required,
           tags_json, payload_json, created_by, created_at)
        VALUES ('hz-yue', 2, 2, 2, FALSE, JSON_ARRAY('nature'),
                JSON_OBJECT('char', '日'), 'reviewer', CURRENT_TIMESTAMP(3))
        """);
    jdbc.update(
        """
        UPDATE content_item
        SET current_revision = 2, updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = 'hz-yue'
        """);

    String snapshot =
        mvc.perform(
                get("/v1/admin/content/releases/corpus-snapshot-v1/snapshot")
                    .with(
                        request -> {
                          request.setRemoteAddr("127.0.0.1");
                          return request;
                        })
                    .header("X-Admin-Token", "test-admin-token"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8);
    JsonNode captured = json.readTree(snapshot).path("items").get(0);
    assertThat(captured.path("revision").asInt()).isEqualTo(1);
    assertThat(captured.path("payload").path("char").asText()).isEqualTo("月");
  }

  private JsonNode platformLogin(String code) throws Exception {
    DOUYIN.enqueue(
        new MockResponse()
            .setHeader("Content-Type", "application/json")
            .setBody(
                """
                {
                  "err_no": 0,
                  "err_tips": "success",
                  "data": {"openid": "%s", "session_key": "session"}
                }
                """
                    .formatted("douyin-open-" + code)));
    String loginBody =
        mvc.perform(
                post("/v1/auth/platform-login")
                    .contentType("application/json")
                    .content(
                        """
                        {
                          "platform":"DOUYIN",
                          "platformAppId":"douyin-app",
                          "code":"%s"
                        }
                        """
                            .formatted(code)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return json.readTree(loginBody);
  }

  private org.springframework.test.web.servlet.ResultActions manifest(
      JsonNode auth, String childId) throws Exception {
    return manifestWithAccess(auth.path("accessToken").asText(), childId);
  }

  private org.springframework.test.web.servlet.ResultActions manifestWithAccess(
      String accessToken, String childId) throws Exception {
    return mvc.perform(
        get("/v1/content/manifest")
            .header("Authorization", "Bearer " + accessToken)
            .header("X-Child-Profile-Id", childId));
  }

  @AfterAll
  static void stopDouyin() throws IOException {
    DOUYIN.shutdown();
  }

  private static MockWebServer startDouyin() {
    MockWebServer server = new MockWebServer();
    try {
      server.start();
      return server;
    } catch (IOException error) {
      throw new ExceptionInInitializerError(error);
    }
  }
}
