package com.childedu.chinese.operations;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import com.childedu.chinese.content.domain.ReleaseStatus;
import com.childedu.chinese.operations.api.AdminExceptionHandler;
import com.childedu.chinese.operations.api.ContentAdminController;
import com.childedu.chinese.operations.api.ReleaseSnapshotResponse;
import com.childedu.chinese.operations.application.ContentAdminService;
import com.childedu.chinese.operations.application.ContentReleasePage;
import com.childedu.chinese.operations.application.ContentReleaseSummary;
import com.childedu.chinese.operations.domain.AdminRole;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;

class ContentAdminControllerTest {

  private ContentAdminService service;
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    service = mock(ContentAdminService.class);
    mvc =
        standaloneSetup(new ContentAdminController(service))
            .setControllerAdvice(new AdminExceptionHandler())
            .build();
  }

  @Test
  void publisherSearchesReleaseSummaries() throws Exception {
    when(service.search(ReleaseStatus.DRAFT, null, 20))
        .thenReturn(
            new ContentReleasePage(
                List.of(
                    new ContentReleaseSummary(
                        "corpus-v6",
                        "mastery-v1",
                        "progression-v1",
                        "content-level-v1",
                        "1.0.0",
                        ReleaseStatus.DRAFT,
                        5,
                        Instant.parse("2026-08-29T00:00:00Z"),
                        null)),
                null));

    mvc.perform(
            get("/v1/admin/content/releases")
                .param("status", "DRAFT")
                .param("limit", "20")
                .requestAttr("admin.actor", "publisher-1")
                .requestAttr("admin.roles", Set.of(AdminRole.PUBLISHER)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].version").value("corpus-v6"))
        .andExpect(jsonPath("$.items[0].artifactCount").value(5))
        .andExpect(jsonPath("$.items[0].status").value("DRAFT"))
        .andExpect(jsonPath("$.nextCursor").doesNotExist());
  }

  @Test
  void publisherReadsCompleteReleaseDetails() throws Exception {
    ContentReleaseArtifact artifact =
        new ContentReleaseArtifact(
            "corpus-v6",
            ContentLevel.L1,
            "https://cdn.test/corpus-v6/L1.tar.gz",
            "a".repeat(64),
            101L,
            "tar+gzip",
            "mastery-v1",
            "progression-v1",
            "content-level-v1",
            "1.0.0");
    when(service.snapshot("corpus-v6"))
        .thenReturn(
            new ReleaseSnapshotResponse(
                "corpus-v6",
                "mastery-v1",
                "progression-v1",
                "content-level-v1",
                "1.0.0",
                ReleaseStatus.VALIDATED,
                List.of(),
                List.of(artifact)));

    mvc.perform(
            get("/v1/admin/content/releases/{version}/snapshot", "corpus-v6")
                .requestAttr("admin.actor", "publisher-1")
                .requestAttr("admin.roles", Set.of(AdminRole.PUBLISHER)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value("corpus-v6"))
        .andExpect(jsonPath("$.status").value("VALIDATED"))
        .andExpect(jsonPath("$.artifacts[0].level").value("L1"));
  }

  @Test
  void releaseReadsRequirePublisherRole() throws Exception {
    mvc.perform(
            get("/v1/admin/content/releases")
                .requestAttr("admin.actor", "editor-1")
                .requestAttr("admin.roles", Set.of(AdminRole.EDITOR)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ADMIN_ROLE_FORBIDDEN"));

    mvc.perform(
            get("/v1/admin/content/releases/{version}/snapshot", "corpus-v6")
                .requestAttr("admin.actor", "editor-1")
                .requestAttr("admin.roles", Set.of(AdminRole.EDITOR)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ADMIN_ROLE_FORBIDDEN"));
  }
}
