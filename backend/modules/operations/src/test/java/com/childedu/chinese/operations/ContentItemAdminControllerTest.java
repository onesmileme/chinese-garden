package com.childedu.chinese.operations;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

import com.childedu.chinese.content.domain.ContentIssue;
import com.childedu.chinese.content.domain.ContentIssueCode;
import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import com.childedu.chinese.content.domain.LevelCoverage;
import com.childedu.chinese.operations.api.AdminExceptionHandler;
import com.childedu.chinese.operations.api.ContentPageResponse;
import com.childedu.chinese.operations.api.ContentItemAdminController;
import com.childedu.chinese.operations.api.LevelCoverageController;
import com.childedu.chinese.operations.api.SaveContentRequest;
import com.childedu.chinese.operations.application.AuditLog;
import com.childedu.chinese.operations.application.ContentAuthoringService;
import com.childedu.chinese.operations.application.ContentCatalogRepository;
import com.childedu.chinese.operations.application.ContentRevisionConflict;
import com.childedu.chinese.operations.application.ContentValidationException;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

class ContentItemAdminControllerTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private ContentAuthoringService service;
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    service = mock(ContentAuthoringService.class);
    mvc =
        standaloneSetup(
                new ContentItemAdminController(service), new LevelCoverageController(service))
            .setControllerAdvice(new AdminExceptionHandler())
            .build();
  }

  @Test
  void editorCreatesContentUsingAuthenticatedRequestAttributesNotActorHeader() throws Exception {
    when(service.create(any(SaveContentRequest.class), any(AdminPrincipal.class)))
        .thenReturn(character());

    mvc.perform(
            post("/v1/admin/content/items")
                .requestAttr("admin.actor", "editor-1")
                .requestAttr("admin.roles", Set.of(AdminRole.EDITOR))
                .header("X-Actor", "spoofed-actor")
                .contentType(MediaType.APPLICATION_JSON)
                .content(validCharacterRequest()))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").value("hz-yue-月"))
        .andExpect(jsonPath("$.revision").value(1));

    ArgumentCaptor<AdminPrincipal> principal = ArgumentCaptor.forClass(AdminPrincipal.class);
    verify(service).create(any(SaveContentRequest.class), principal.capture());
    org.assertj.core.api.Assertions.assertThat(principal.getValue().actor()).isEqualTo("editor-1");
  }

  @Test
  void readsUpdatesActivatesAndArchivesContent() throws Exception {
    ContentItemView draft = character();
    ContentItemView revised = item(ContentStatus.DRAFT, 2);
    ContentItemView active = item(ContentStatus.ACTIVE, 2);
    ContentItemView archived = item(ContentStatus.ARCHIVED, 2);
    when(service.find("hz-yue-月")).thenReturn(draft);
    when(service.update(
            eq("hz-yue-月"), eq(1), any(SaveContentRequest.class), any(AdminPrincipal.class)))
        .thenReturn(revised);
    when(service.activate(eq("hz-yue-月"), eq(2), any(AdminPrincipal.class)))
        .thenReturn(active);
    when(service.archive(eq("hz-yue-月"), eq(2), any(AdminPrincipal.class)))
        .thenReturn(archived);

    mvc.perform(get("/v1/admin/content/items/{id}", "hz-yue-月"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.revision").value(1));
    mvc.perform(
            patch("/v1/admin/content/items/{id}", "hz-yue-月")
                .param("expectedRevision", "1")
                .requestAttr("admin.actor", "editor-1")
                .requestAttr("admin.roles", Set.of(AdminRole.EDITOR))
                .contentType(MediaType.APPLICATION_JSON)
                .content(validCharacterRequest()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.revision").value(2));
    mvc.perform(
            post("/v1/admin/content/items/{id}/activate", "hz-yue-月")
                .param("expectedRevision", "2")
                .requestAttr("admin.actor", "reviewer-1")
                .requestAttr("admin.roles", Set.of(AdminRole.REVIEWER)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ACTIVE"));
    mvc.perform(
            post("/v1/admin/content/items/{id}/archive", "hz-yue-月")
                .param("expectedRevision", "2")
                .requestAttr("admin.actor", "editor-1")
                .requestAttr("admin.roles", Set.of(AdminRole.EDITOR)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ARCHIVED"));
  }

  @Test
  void filtersAndPaginatesContent() throws Exception {
    when(service.search(
            ContentType.CHARACTER,
            ContentLevel.L1,
            ContentStatus.DRAFT,
            "自然",
            "月",
            "hz-ri-日",
            1))
        .thenReturn(new ContentPageResponse(List.of(character()), "hz-yue-月"));

    mvc.perform(
            get("/v1/admin/content/items")
                .param("type", "CHARACTER")
                .param("level", "L1")
                .param("status", "DRAFT")
                .param("tag", "自然")
                .param("keyword", "月")
                .param("cursor", "hz-ri-日")
                .param("limit", "1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value("hz-yue-月"))
        .andExpect(jsonPath("$.nextCursor").value("hz-yue-月"));
  }

  @Test
  void reviewerValidatesContentAndReceivesAllIssues() throws Exception {
    ContentIssue issue =
        new ContentIssue(
            ContentIssueCode.POEM_CHAR_REF_MISSING,
            "sc-jingyesi",
            "/payload/charRefs/0",
            "referenced character does not exist");
    when(service.validate(eq("sc-jingyesi"), any(AdminPrincipal.class)))
        .thenReturn(List.of(issue));

    mvc.perform(
            post("/v1/admin/content/items/{id}/validate", "sc-jingyesi")
                .requestAttr("admin.actor", "reviewer-1")
                .requestAttr("admin.roles", Set.of(AdminRole.REVIEWER)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.valid").value(false))
        .andExpect(jsonPath("$.issues[0].code").value("POEM_CHAR_REF_MISSING"))
        .andExpect(jsonPath("$.issues[0].path").value("/payload/charRefs/0"));
  }

  @Test
  void returnsCoverageForAllLevels() throws Exception {
    when(service.coverage(any(AdminPrincipal.class)))
        .thenReturn(
            List.of(
                new LevelCoverage(
                    ContentLevel.L1,
                    10,
                    1,
                    8,
                    List.of(ContentIssueCode.LEVEL_CONTENT_INSUFFICIENT))));

    mvc.perform(
            get("/v1/admin/content/levels/coverage")
                .requestAttr("admin.actor", "reviewer-1")
                .requestAttr("admin.roles", Set.of(AdminRole.REVIEWER)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].level").value("L1"))
        .andExpect(jsonPath("$[0].characters").value(10))
        .andExpect(jsonPath("$[0].blockingIssues[0]").value("LEVEL_CONTENT_INSUFFICIENT"));
  }

  @Test
  void deniesMissingRoleWithStructuredError() throws Exception {
    ContentAuthoringService authorizedService =
        new ContentAuthoringService(
            mock(ContentCatalogRepository.class),
            mock(AuditLog.class),
            MAPPER,
            mock(com.childedu.chinese.content.domain.ContentValidator.class),
            mock(TransactionTemplate.class),
            Clock.systemUTC());
    MockMvc authorizedMvc =
        standaloneSetup(new ContentItemAdminController(authorizedService))
            .setControllerAdvice(new AdminExceptionHandler())
            .build();

    authorizedMvc
        .perform(
            post("/v1/admin/content/items")
                .requestAttr("admin.actor", "reviewer-1")
                .requestAttr("admin.roles", Set.of(AdminRole.REVIEWER))
                .contentType(MediaType.APPLICATION_JSON)
                .content(validCharacterRequest()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ADMIN_ROLE_FORBIDDEN"));
  }

  @Test
  void reportsRevisionConflictWithStructuredDetails() throws Exception {
    when(service.update(
            eq("hz-yue-月"), anyInt(), any(SaveContentRequest.class), any(AdminPrincipal.class)))
        .thenThrow(new ContentRevisionConflict("hz-yue-月", 1, 2));

    mvc.perform(
            patch("/v1/admin/content/items/{id}", "hz-yue-月")
                .param("expectedRevision", "1")
                .requestAttr("admin.actor", "editor-1")
                .requestAttr("admin.roles", Set.of(AdminRole.EDITOR))
                .contentType(MediaType.APPLICATION_JSON)
                .content(validCharacterRequest()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONTENT_REVISION_CONFLICT"))
        .andExpect(jsonPath("$.path").value("/expectedRevision"))
        .andExpect(jsonPath("$.details.expectedRevision").value(1))
        .andExpect(jsonPath("$.details.actualRevision").value(2));
  }

  @Test
  void reportsAllStructuredValidationErrors() throws Exception {
    List<ContentIssue> issues =
        List.of(
            new ContentIssue(
                ContentIssueCode.POEM_CHAR_REF_MISSING,
                "sc-jingyesi",
                "/payload/charRefs/0",
                "referenced character does not exist"),
            new ContentIssue(
                ContentIssueCode.POEM_CHAR_LEVEL_TOO_HIGH,
                "sc-jingyesi",
                "/payload/charRefs/1",
                "referenced character level exceeds poem level"));
    when(service.activate(eq("sc-jingyesi"), eq(1), any(AdminPrincipal.class)))
        .thenThrow(new ContentValidationException(issues));

    mvc.perform(
            post("/v1/admin/content/items/{id}/activate", "sc-jingyesi")
                .param("expectedRevision", "1")
                .requestAttr("admin.actor", "reviewer-1")
                .requestAttr("admin.roles", Set.of(AdminRole.REVIEWER)))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("POEM_CHAR_REF_MISSING"))
        .andExpect(jsonPath("$.path").value("/payload/charRefs/0"))
        .andExpect(jsonPath("$.details[0].code").value("POEM_CHAR_REF_MISSING"))
        .andExpect(jsonPath("$.details[1].code").value("POEM_CHAR_LEVEL_TOO_HIGH"));
  }

  @Test
  void malformedRequestReturnsStructuredFieldError() throws Exception {
    mvc.perform(
            post("/v1/admin/content/items")
                .requestAttr("admin.actor", "editor-1")
                .requestAttr("admin.roles", Set.of(AdminRole.EDITOR))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("CONTENT_FIELD_INVALID"));
  }

  private static ContentItemView character() throws Exception {
    return item(ContentStatus.DRAFT, 1);
  }

  private static ContentItemView item(ContentStatus status, int revision) throws Exception {
    return new ContentItemView(
        "hz-yue-月",
        ContentType.CHARACTER,
        status,
        revision,
        ContentLevel.L1,
        ContentLevel.L1,
        true,
        List.of("自然"),
        MAPPER.readTree("{\"char\":\"月\",\"pinyin\":\"yue\"}"));
  }

  private static String validCharacterRequest() {
    return """
        {
          "id":"hz-yue-月",
          "type":"CHARACTER",
          "level":"L1",
          "difficulty":"L1",
          "promotionRequired":true,
          "tags":["自然"],
          "payload":{"char":"月","pinyin":"yue"}
        }
        """;
  }
}
