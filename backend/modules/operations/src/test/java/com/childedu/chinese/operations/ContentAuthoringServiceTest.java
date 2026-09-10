package com.childedu.chinese.operations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.childedu.chinese.content.domain.ContentDraft;
import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentIssueCode;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentLevelRules;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import com.childedu.chinese.content.domain.ContentValidator;
import com.childedu.chinese.content.domain.MinimumContent;
import com.childedu.chinese.operations.api.ContentPageResponse;
import com.childedu.chinese.operations.api.SaveContentRequest;
import com.childedu.chinese.operations.application.AuditLog;
import com.childedu.chinese.operations.application.ContentAuthoringService;
import com.childedu.chinese.operations.application.ContentCatalogRepository;
import com.childedu.chinese.operations.application.ContentRevisionConflict;
import com.childedu.chinese.operations.application.ContentValidationException;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class ContentAuthoringServiceTest {

  private static final Instant NOW = Instant.parse("2026-08-25T08:00:00Z");
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final AdminPrincipal EDITOR =
      new AdminPrincipal("editor-1", Set.of(AdminRole.EDITOR), true);
  private static final AdminPrincipal REVIEWER =
      new AdminPrincipal("reviewer-1", Set.of(AdminRole.REVIEWER), true);

  @Test
  void editorCreatesTheFirstImmutableDraftRevision() throws Exception {
    ContentAuthoringService service =
        service(new InMemoryCatalogRepository(), new RecordingAuditLog());

    ContentItemView created = service.create(characterRequest(), EDITOR);

    assertThat(created.id()).isEqualTo("hz-yue-月");
    assertThat(created.revision()).isEqualTo(1);
    assertThat(created.status()).isEqualTo(ContentStatus.DRAFT);
    assertThat(created.payload().get("char").asText()).isEqualTo("月");
  }

  @Test
  void editorAppendsARevisionAndReturnsTheItemToDraft() throws Exception {
    ContentAuthoringService service =
        service(new InMemoryCatalogRepository(), new RecordingAuditLog());
    service.create(characterRequest(), EDITOR);
    SaveContentRequest changed =
        new SaveContentRequest(
            "hz-yue-月",
            ContentType.CHARACTER,
            ContentLevel.L1,
            ContentLevel.L2,
            true,
            List.of("自然", "基础"),
            MAPPER.readTree("{\"char\":\"月\",\"pinyin\":\"yuè\"}"));

    ContentItemView updated = service.update("hz-yue-月", 1, changed, EDITOR);

    assertThat(updated.revision()).isEqualTo(2);
    assertThat(updated.status()).isEqualTo(ContentStatus.DRAFT);
    assertThat(updated.difficulty()).isEqualTo(ContentLevel.L2);
    assertThat(updated.payload().get("pinyin").asText()).isEqualTo("yuè");
  }

  @Test
  void staleRevisionIsRejectedWithTheCurrentRevision() throws Exception {
    ContentAuthoringService service =
        service(new InMemoryCatalogRepository(), new RecordingAuditLog());
    service.create(characterRequest(), EDITOR);
    service.update("hz-yue-月", 1, characterRequest(), EDITOR);

    assertThatThrownBy(() -> service.update("hz-yue-月", 1, characterRequest(), EDITOR))
        .isInstanceOfSatisfying(
            ContentRevisionConflict.class,
            conflict -> {
              assertThat(conflict.expectedRevision()).isEqualTo(1);
              assertThat(conflict.actualRevision()).isEqualTo(2);
            });
  }

  @Test
  void findsTheLatestRevisionByStableId() throws Exception {
    ContentAuthoringService service =
        service(new InMemoryCatalogRepository(), new RecordingAuditLog());
    service.create(characterRequest(), EDITOR);
    service.update("hz-yue-月", 1, characterRequest(), EDITOR);

    ContentItemView found = service.find("hz-yue-月");

    assertThat(found.id()).isEqualTo("hz-yue-月");
    assertThat(found.revision()).isEqualTo(2);
  }

  @Test
  void searchesWithFiltersAndAnExclusiveCursor() throws Exception {
    ContentAuthoringService service =
        service(new InMemoryCatalogRepository(), new RecordingAuditLog());
    service.create(characterRequest("hz-yue-月", "月"), EDITOR);
    service.create(characterRequest("hz-ri-日", "日"), EDITOR);
    service.create(
        new SaveContentRequest(
            "sc-jingyesi",
            ContentType.POEM,
            ContentLevel.L1,
            ContentLevel.L1,
            true,
            List.of("自然"),
            MAPPER.readTree("{\"title\":\"静夜思\",\"theme\":\"自然\"}")),
        EDITOR);

    ContentPageResponse first =
        service.search(
            ContentType.CHARACTER,
            ContentLevel.L1,
            ContentStatus.DRAFT,
            "自然",
            "自然",
            null,
            1);
    ContentPageResponse second =
        service.search(
            ContentType.CHARACTER,
            ContentLevel.L1,
            ContentStatus.DRAFT,
            "自然",
            "自然",
            first.nextCursor(),
            1);

    assertThat(first.items()).extracting(ContentItemView::id).containsExactly("hz-ri-日");
    assertThat(first.nextCursor()).isEqualTo("hz-ri-日");
    assertThat(second.items()).extracting(ContentItemView::id).containsExactly("hz-yue-月");
    assertThat(second.nextCursor()).isNull();
  }

  @Test
  void reviewerActivatesTheExpectedCurrentRevision() throws Exception {
    ContentAuthoringService service =
        service(new InMemoryCatalogRepository(), new RecordingAuditLog());
    service.create(characterRequest(), EDITOR);

    ContentItemView activated = service.activate("hz-yue-月", 1, REVIEWER);

    assertThat(activated.status()).isEqualTo(ContentStatus.ACTIVE);
    assertThat(activated.revision()).isEqualTo(1);
  }

  @Test
  void reviewerCannotActivateAnIdiomWithoutALevelEligibleSuccessor() throws Exception {
    ContentAuthoringService service =
        service(new InMemoryCatalogRepository(), new RecordingAuditLog());
    service.create(
        new SaveContentRequest(
            "cy-source",
            ContentType.IDIOM,
            ContentLevel.L1,
            ContentLevel.L1,
            false,
            List.of(),
            MAPPER.readTree(
                """
                {"text":"马到成功","meaning":"测试","headPinyin":"ma","tailPinyin":"gong"}
                """)),
        EDITOR);

    assertThatThrownBy(() -> service.activate("cy-source", 1, REVIEWER))
        .isInstanceOfSatisfying(
            ContentValidationException.class,
            error ->
                assertThat(error.issues())
                    .extracting(issue -> issue.code())
                    .containsExactly(ContentIssueCode.IDIOM_CHAIN_BROKEN_AT_LEVEL));
  }

  @Test
  void editorArchivesTheExpectedCurrentRevision() throws Exception {
    ContentAuthoringService service =
        service(new InMemoryCatalogRepository(), new RecordingAuditLog());
    service.create(characterRequest(), EDITOR);

    ContentItemView archived = service.archive("hz-yue-月", 1, EDITOR);

    assertThat(archived.status()).isEqualTo(ContentStatus.ARCHIVED);
    assertThat(archived.revision()).isEqualTo(1);
  }

  @Test
  void createRecordsStructuredAuditInTheWriteTransaction() throws Exception {
    RecordingAuditLog audit = new RecordingAuditLog();
    ContentAuthoringService service = service(new InMemoryCatalogRepository(), audit);

    service.create(characterRequest(), EDITOR);

    assertThat(audit.events).hasSize(1);
    AuditEvent event = audit.events.getFirst();
    assertThat(event.actor()).isEqualTo("editor-1");
    assertThat(event.action()).isEqualTo("CREATE");
    assertThat(event.target()).isEqualTo("hz-yue-月");
    assertThat(event.before().isNull()).isTrue();
    assertThat(event.after().get("revision").asInt()).isEqualTo(1);
    assertThat(event.success()).isTrue();
    assertThat(event.at()).isEqualTo(NOW);
  }

  private static ContentAuthoringService service(
      ContentCatalogRepository repository, AuditLog audit) {
    return new ContentAuthoringService(
        repository,
        audit,
        MAPPER,
        new ContentValidator(MAPPER, validationRules()),
        immediateTransactionTemplate(),
        Clock.fixed(NOW, ZoneOffset.UTC));
  }

  private static ContentLevelRules validationRules() {
    MinimumContent none = new MinimumContent(0, 0, 0);
    return new ContentLevelRules(
        "content-level-test", Map.of(1, none, 2, none, 3, none, 4, none, 5, none));
  }

  private static TransactionTemplate immediateTransactionTemplate() {
    TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
    when(transactionTemplate.execute(any()))
        .thenAnswer(
            invocation ->
                invocation
                    .<TransactionCallback<Object>>getArgument(0)
                    .doInTransaction(mock(TransactionStatus.class)));
    return transactionTemplate;
  }

  private static SaveContentRequest characterRequest() throws Exception {
    return characterRequest("hz-yue-月", "月");
  }

  private static SaveContentRequest characterRequest(String id, String character)
      throws Exception {
    return new SaveContentRequest(
        id,
        ContentType.CHARACTER,
        ContentLevel.L1,
        ContentLevel.L1,
        true,
        List.of("自然"),
        MAPPER.readTree(
            "{\"char\":\"" + character + "\",\"pinyin\":\"yuè\",\"theme\":\"自然\"}"));
  }

  private static final class InMemoryCatalogRepository implements ContentCatalogRepository {
    private final Map<String, ContentItemView> items = new TreeMap<>();

    @Override
    public ContentItemView create(ContentDraft draft, String actor, Instant now) {
      ContentItemView created =
          new ContentItemView(
              draft.id(),
              draft.type(),
              ContentStatus.DRAFT,
              1,
              draft.level(),
              draft.difficulty(),
              draft.promotionRequired(),
              draft.tags(),
              draft.payload());
      items.put(created.id(), created);
      return created;
    }

    @Override
    public ContentItemView update(
        String id, int expectedRevision, ContentDraft draft, String actor, Instant now) {
      ContentItemView current = items.get(id);
      if (current == null || current.revision() != expectedRevision) {
        throw new ContentRevisionConflict(
            id, expectedRevision, current == null ? 0 : current.revision());
      }
      ContentItemView updated =
          new ContentItemView(
              id,
              draft.type(),
              ContentStatus.DRAFT,
              expectedRevision + 1,
              draft.level(),
              draft.difficulty(),
              draft.promotionRequired(),
              draft.tags(),
              draft.payload());
      items.put(id, updated);
      return updated;
    }

    @Override
    public Optional<ContentItemView> find(String id) {
      return Optional.ofNullable(items.get(id));
    }

    @Override
    public List<ContentItemView> search(
        ContentType type,
        ContentLevel level,
        ContentStatus status,
        String tag,
        String keyword,
        String cursor,
        int limit) {
      return items.values().stream()
          .filter(item -> type == null || item.type() == type)
          .filter(item -> level == null || item.level() == level)
          .filter(item -> status == null || item.status() == status)
          .filter(item -> tag == null || item.tags().contains(tag))
          .filter(
              item ->
                  keyword == null
                      || item.id().contains(keyword)
                      || item.payload().toString().contains(keyword))
          .filter(item -> cursor == null || item.id().compareTo(cursor) > 0)
          .limit(limit)
          .toList();
    }

    @Override
    public ContentItemView changeStatus(
        String id, int expectedRevision, ContentStatus status, Instant now) {
      ContentItemView current = items.get(id);
      if (current == null || current.revision() != expectedRevision) {
        throw new ContentRevisionConflict(
            id, expectedRevision, current == null ? 0 : current.revision());
      }
      ContentItemView changed =
          new ContentItemView(
              current.id(),
              current.type(),
              status,
              current.revision(),
              current.level(),
              current.difficulty(),
              current.promotionRequired(),
              current.tags(),
              current.payload());
      items.put(id, changed);
      return changed;
    }

    @Override
    public void lockForInitialImport() {}

    @Override
    public boolean isEmpty() {
      return true;
    }

    @Override
    public void importRevision(
        String id,
        String type,
        ContentStatus status,
        int revision,
        int level,
        int difficulty,
        boolean promotionRequired,
        List<String> tags,
        String payloadJson,
        String actor,
        Instant now) {}

    @Override
    public void batchCreate(Collection<ContentDraft> drafts, String actor, Instant now) {}
  }

  private static final class RecordingAuditLog implements AuditLog {
    private final List<AuditEvent> events = new java.util.ArrayList<>();

    @Override
    public void record(
        String actor,
        String action,
        String target,
        JsonNode before,
        JsonNode after,
        String reason,
        boolean success,
        Instant at) {
      events.add(new AuditEvent(actor, action, target, before, after, reason, success, at));
    }
  }

  private record AuditEvent(
      String actor,
      String action,
      String target,
      JsonNode before,
      JsonNode after,
      String reason,
      boolean success,
      Instant at) {}
}
