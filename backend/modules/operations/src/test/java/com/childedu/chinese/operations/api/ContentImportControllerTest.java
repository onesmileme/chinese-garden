package com.childedu.chinese.operations.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

import com.childedu.chinese.operations.application.AdminRequestAttributes;
import com.childedu.chinese.operations.application.RawContentImportService;
import com.childedu.chinese.operations.application.RawContentImportService.AppendResult;
import com.childedu.chinese.operations.application.RawContentImportService.BatchView;
import com.childedu.chinese.operations.application.RawContentImportService.RawCandidate;
import com.childedu.chinese.operations.domain.AdminRole;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class ContentImportControllerTest {

  private static final ObjectMapper MAPPER = new ObjectMapper()
      .registerModule(new JavaTimeModule());
  private RawContentImportService service;
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    service = mock(RawContentImportService.class);
    mvc =
        standaloneSetup(
                new ContentImportController(service, MAPPER))
            .setControllerAdvice(new AdminExceptionHandler())
            .build();
  }

  @Test
  void shouldCreateBatchAndAppendCandidates() throws Exception {
    var batchView = new BatchView("batch-001", "raw-corpus-v1", "RUNNING",
        Map.of("characters", 3000), Instant.now(), null);
    var completedView = new BatchView("batch-001", "raw-corpus-v1", "COMPLETED",
        Map.of("characters", 3000), batchView.startedAt(), Instant.now());
    var appendResult = new AppendResult(1, 0, 0);

    when(service.createBatch(eq("raw-corpus-v1"), any(Map.class), eq("editor"), any(Instant.class)))
        .thenReturn(batchView);
    when(service.appendCandidates(eq("batch-001"), any(List.class), eq("editor"), any(Instant.class)))
        .thenReturn(appendResult);
    when(service.completeBatch(eq("batch-001"), eq("editor"), any(Instant.class)))
        .thenReturn(completedView);
    when(service.findBatch("batch-001")).thenReturn(completedView);

    // Create batch
    var createBody = MAPPER.writeValueAsString(Map.of(
        "ruleVersion", "raw-corpus-v1",
        "characters", 3000));
    mvc.perform(post("/v1/admin/content-imports")
            .requestAttr(AdminRequestAttributes.ACTOR, "editor")
            .requestAttr(AdminRequestAttributes.ROLES, Set.of(AdminRole.EDITOR))
            .contentType(MediaType.APPLICATION_JSON)
            .content(createBody))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.status").value("RUNNING"));

    // Append candidates
    var candidate = new LinkedHashMap<String, Object>();
    candidate.put("importKey", "XINHUA_WORD:word:啊");
    candidate.put("source", "XINHUA_WORD");
    candidate.put("sourceRef", "word:啊");
    candidate.put("sourceHash", "abc123");
    candidate.put("ruleVersion", "raw-corpus-v1");
    candidate.put("id", "hz-a-啊");
    candidate.put("type", "CHARACTER");
    candidate.put("suggestedLevel", 1);
    candidate.put("suggestedDifficulty", 1);
    candidate.put("promotionRequired", false);
    candidate.put("tags", List.of());
    candidate.put("payload", Map.of("char", "啊", "pinyin", "ā", "imageId", "img-啊", "theme", "world", "strokes", 10));
    candidate.put("score", 100.0);
    var candidates = List.of(candidate);
    mvc.perform(post("/v1/admin/content-imports/{id}/candidates", "batch-001")
            .requestAttr(AdminRequestAttributes.ACTOR, "editor")
            .requestAttr(AdminRequestAttributes.ROLES, Set.of(AdminRole.EDITOR))
            .contentType(MediaType.APPLICATION_JSON)
            .content(MAPPER.writeValueAsString(candidates)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.imported").value(1));

    // Complete
    mvc.perform(post("/v1/admin/content-imports/{id}/complete", "batch-001")
            .requestAttr(AdminRequestAttributes.ACTOR, "editor")
            .requestAttr(AdminRequestAttributes.ROLES, Set.of(AdminRole.EDITOR)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("COMPLETED"));

    // Get batch
    mvc.perform(get("/v1/admin/content-imports/{id}", "batch-001")
            .requestAttr(AdminRequestAttributes.ACTOR, "editor")
            .requestAttr(AdminRequestAttributes.ROLES, Set.of(AdminRole.EDITOR)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("COMPLETED"));

    verify(service).createBatch(eq("raw-corpus-v1"), any(Map.class), eq("editor"), any(Instant.class));
    verify(service).appendCandidates(eq("batch-001"), any(List.class), eq("editor"), any(Instant.class));
    verify(service).completeBatch(eq("batch-001"), eq("editor"), any(Instant.class));
    verify(service).findBatch("batch-001");
  }

  @Test
  void rejectsReviewerWhenCreatingBatch() throws Exception {
    mvc.perform(
            post("/v1/admin/content-imports")
                .requestAttr(AdminRequestAttributes.ACTOR, "reviewer-1")
                .requestAttr(
                    AdminRequestAttributes.ROLES, Set.of(AdminRole.REVIEWER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"ruleVersion\":\"raw-corpus-v1\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ADMIN_ROLE_FORBIDDEN"));
  }

  @Test
  void rejectsReviewerWhenAppendingCandidates() throws Exception {
    mvc.perform(
            post("/v1/admin/content-imports/{id}/candidates", "batch-001")
                .requestAttr(AdminRequestAttributes.ACTOR, "reviewer-1")
                .requestAttr(
                    AdminRequestAttributes.ROLES, Set.of(AdminRole.REVIEWER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("[]"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ADMIN_ROLE_FORBIDDEN"));
  }

  @Test
  void rejectsReviewerWhenCompletingBatch() throws Exception {
    mvc.perform(
            post("/v1/admin/content-imports/{id}/complete", "batch-001")
                .requestAttr(AdminRequestAttributes.ACTOR, "reviewer-1")
                .requestAttr(
                    AdminRequestAttributes.ROLES, Set.of(AdminRole.REVIEWER)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ADMIN_ROLE_FORBIDDEN"));
  }

  @Test
  void rejectsReviewerWhenFindingBatch() throws Exception {
    mvc.perform(
            get("/v1/admin/content-imports/{id}", "batch-001")
                .requestAttr(AdminRequestAttributes.ACTOR, "reviewer-1")
                .requestAttr(
                    AdminRequestAttributes.ROLES, Set.of(AdminRole.REVIEWER)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ADMIN_ROLE_FORBIDDEN"));
  }
}
