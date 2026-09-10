package com.childedu.chinese.app;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;

import com.childedu.chinese.operations.application.AdminTokenDigest;
import com.childedu.chinese.operations.application.AuditLog;
import com.childedu.chinese.testsupport.MySqlContainerSupport;
import com.fasterxml.jackson.databind.node.NullNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest(
    properties = {
      "childedu.admin.token=admin-test-token",
      "childedu.admin.allowed-ips=127.0.0.1"
    })
@AutoConfigureMockMvc
class AdminEndpointSecurityIT {

  private static final String TOKEN = "admin-test-token";
  private static final String VERSION = "corpus-v1";

  @DynamicPropertySource
  static void datasource(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", MySqlContainerSupport::jdbcUrl);
    registry.add("spring.datasource.username", MySqlContainerSupport::username);
    registry.add("spring.datasource.password", MySqlContainerSupport::password);
  }

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @MockBean AuditLog audit;

  @BeforeEach
  void clean() {
    jdbc.update("DELETE FROM content_release_artifact");
    jdbc.update("DELETE FROM content_release_item");
    jdbc.update("DELETE FROM content_release");
    jdbc.update("DELETE FROM admin_principal");
    clearInvocations(audit);
  }

  @Test
  void guardsAndAdvancesTheReleaseStateMachine() throws Exception {
    mvc.perform(fromLocalhost(post("/v1/admin/content/releases").content(registerBody())))
        .andExpect(status().isUnauthorized());

    mvc.perform(
            authenticated(post("/v1/admin/content/releases"))
                .contentType("application/json")
                .content(registerBody()))
        .andExpect(status().isAccepted());
    verify(audit)
        .record(
            eq("bootstrap-admin"),
            eq("REGISTER"),
            eq(VERSION),
            eq(NullNode.getInstance()),
            eq(NullNode.getInstance()),
            isNull(),
            eq(true),
            any());

    mvc.perform(
            authenticated(
                    post("/v1/admin/content/releases/{version}/artifacts", VERSION))
                .contentType("application/json")
                .content(artifactsBody()))
        .andExpect(status().isNoContent());
    transition("VALIDATED").andExpect(status().isNoContent());
    verify(audit)
        .record(
            eq("bootstrap-admin"),
            eq("TRANSITION:VALIDATED"),
            eq(VERSION),
            eq(NullNode.getInstance()),
            eq(NullNode.getInstance()),
            isNull(),
            eq(true),
            any());
    transition("PUBLISHED").andExpect(status().isNoContent());
    transition("VALIDATED").andExpect(status().isConflict());
  }

  @Test
  void rejectsAnAuthenticatedEditorFromPublisherEndpoints() throws Exception {
    jdbc.update(
        """
        INSERT INTO admin_principal
          (actor, token_sha256, roles_json, status, created_at, updated_at)
        VALUES (?, ?, JSON_ARRAY('EDITOR'), 'ACTIVE',
                CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
        """,
        "editor-1",
        AdminTokenDigest.sha256("editor-token"));

    mvc.perform(
            fromLocalhost(post("/v1/admin/content/releases"))
                .header("X-Admin-Token", "editor-token")
                .contentType("application/json")
                .content(registerBody()))
        .andExpect(status().isForbidden());
  }

  private org.springframework.test.web.servlet.ResultActions transition(String target)
      throws Exception {
    return mvc.perform(
        authenticated(post("/v1/admin/content/releases/{version}/status", VERSION))
            .header("X-Actor", "spoofed-actor")
            .contentType("application/json")
            .content("{\"toStatus\":\"" + target + "\"}"));
  }

  private static MockHttpServletRequestBuilder authenticated(MockHttpServletRequestBuilder request) {
    return fromLocalhost(request).header("X-Admin-Token", TOKEN);
  }

  private static MockHttpServletRequestBuilder fromLocalhost(
      MockHttpServletRequestBuilder request) {
    return request.with(
        servletRequest -> {
          servletRequest.setRemoteAddr("127.0.0.1");
          return servletRequest;
        });
  }

  private static String registerBody() {
    return """
        {
          "version":"corpus-v1",
          "ruleVersion":"mastery-v1",
          "manifestUrl":"https://example.test/releases/corpus-v1.tar.gz",
          "sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "fileSize":512,
          "minClientVersion":"1.0.0"
        }
        """;
  }

  private static String artifactsBody() {
    return """
        {
          "artifacts":[
            {
              "level":1,
              "artifactUrl":"https://example.test/releases/corpus-v1/L1.tar.gz",
              "sha256":"1111111111111111111111111111111111111111111111111111111111111111",
              "fileSize":501,
              "format":"tar+gzip"
            },
            {
              "level":2,
              "artifactUrl":"https://example.test/releases/corpus-v1/L2.tar.gz",
              "sha256":"2222222222222222222222222222222222222222222222222222222222222222",
              "fileSize":502,
              "format":"tar+gzip"
            },
            {
              "level":3,
              "artifactUrl":"https://example.test/releases/corpus-v1/L3.tar.gz",
              "sha256":"3333333333333333333333333333333333333333333333333333333333333333",
              "fileSize":503,
              "format":"tar+gzip"
            },
            {
              "level":4,
              "artifactUrl":"https://example.test/releases/corpus-v1/L4.tar.gz",
              "sha256":"4444444444444444444444444444444444444444444444444444444444444444",
              "fileSize":504,
              "format":"tar+gzip"
            },
            {
              "level":5,
              "artifactUrl":"https://example.test/releases/corpus-v1/L5.tar.gz",
              "sha256":"5555555555555555555555555555555555555555555555555555555555555555",
              "fileSize":505,
              "format":"tar+gzip"
            }
          ]
        }
        """;
  }
}
