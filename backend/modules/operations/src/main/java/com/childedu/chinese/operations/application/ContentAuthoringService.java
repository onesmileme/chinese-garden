package com.childedu.chinese.operations.application;

import com.childedu.chinese.content.domain.ContentIssue;
import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.LevelCoverage;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import com.childedu.chinese.content.domain.ContentValidator;
import com.childedu.chinese.operations.api.ContentPageResponse;
import com.childedu.chinese.operations.api.SaveContentRequest;
import com.childedu.chinese.operations.domain.AdminPrincipal;
import com.childedu.chinese.operations.domain.AdminRole;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.NullNode;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;
import org.springframework.transaction.support.TransactionTemplate;

public class ContentAuthoringService {

  private final ContentCatalogRepository repository;
  private final AuditLog audit;
  private final ObjectMapper objectMapper;
  private final ContentValidator validator;
  private final TransactionTemplate transactionTemplate;
  private final Clock clock;

  public ContentAuthoringService(
      ContentCatalogRepository repository,
      AuditLog audit,
      ObjectMapper objectMapper,
      ContentValidator validator,
      TransactionTemplate transactionTemplate,
      Clock clock) {
    this.repository = Objects.requireNonNull(repository, "content catalog repository");
    this.audit = Objects.requireNonNull(audit, "audit log");
    this.objectMapper = Objects.requireNonNull(objectMapper, "object mapper");
    this.validator = Objects.requireNonNull(validator, "content validator");
    this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transaction template");
    this.clock = Objects.requireNonNull(clock, "content authoring clock");
  }

  public ContentItemView create(SaveContentRequest request, AdminPrincipal principal) {
    Objects.requireNonNull(principal, "admin principal").require(AdminRole.EDITOR);
    if (request == null) {
      throw new IllegalArgumentException("save content request must not be null");
    }
    Instant now = Instant.now(clock);
    return inTransaction(
        () -> {
          ContentItemView created =
              repository.create(request.toDraft(), principal.actor(), now);
          record(principal.actor(), "CREATE", created.id(), null, created, now);
          return created;
        });
  }

  public ContentItemView update(
      String id,
      int expectedRevision,
      SaveContentRequest request,
      AdminPrincipal principal) {
    Objects.requireNonNull(principal, "admin principal").require(AdminRole.EDITOR);
    if (request == null) {
      throw new IllegalArgumentException("save content request must not be null");
    }
    if (!request.id().equals(id)) {
      throw new IllegalArgumentException("request content id must match path id");
    }
    Instant now = Instant.now(clock);
    return inTransaction(
        () -> {
          ContentItemView before = find(id);
          ContentItemView updated =
              repository.update(
                  id, expectedRevision, request.toDraft(), principal.actor(), now);
          record(principal.actor(), "UPDATE", id, before, updated, now);
          return updated;
        });
  }

  public ContentItemView find(String id) {
    if (id == null || id.isBlank()) {
      throw new IllegalArgumentException("content id must not be blank");
    }
    return repository
        .find(id)
        .orElseThrow(() -> new IllegalArgumentException("content item not found: " + id));
  }

  public ContentPageResponse search(
      ContentType type,
      ContentLevel level,
      ContentStatus status,
      String tag,
      String keyword,
      String cursor,
      int limit) {
    if (limit < 1 || limit > 100) {
      throw new IllegalArgumentException("content page limit must be in 1..100");
    }
    List<ContentItemView> matches =
        repository.search(
            type,
            level,
            status,
            blankToNull(tag),
            blankToNull(keyword),
            blankToNull(cursor),
            limit + 1);
    boolean hasMore = matches.size() > limit;
    List<ContentItemView> items = hasMore ? matches.subList(0, limit) : matches;
    String nextCursor = hasMore ? items.getLast().id() : null;
    return new ContentPageResponse(items, nextCursor);
  }

  public ContentItemView activate(
      String id, int expectedRevision, AdminPrincipal principal) {
    Objects.requireNonNull(principal, "admin principal").require(AdminRole.REVIEWER);
    Instant now = Instant.now(clock);
    return inTransaction(
        () -> {
          ContentItemView candidate = find(id);
          if (candidate.revision() != expectedRevision) {
            throw new ContentRevisionConflict(
                id, expectedRevision, candidate.revision());
          }
          List<ContentIssue> issues =
              validator.validateItem(candidate, currentCatalogExcluding(id));
          if (!issues.isEmpty()) {
            throw new ContentValidationException(issues);
          }
          ContentItemView activated =
              repository.changeStatus(id, expectedRevision, ContentStatus.ACTIVE, now);
          record(principal.actor(), "ACTIVATE", id, candidate, activated, now);
          return activated;
        });
  }

  public List<ContentIssue> validate(String id, AdminPrincipal principal) {
    Objects.requireNonNull(principal, "admin principal").require(AdminRole.REVIEWER);
    ContentItemView candidate = find(id);
    return validator.validateItem(candidate, currentCatalogExcluding(id));
  }

  public List<LevelCoverage> coverage(AdminPrincipal principal) {
    Objects.requireNonNull(principal, "admin principal").require(AdminRole.REVIEWER);
    return validator.coverage(currentCatalog());
  }

  public ContentItemView archive(
      String id, int expectedRevision, AdminPrincipal principal) {
    Objects.requireNonNull(principal, "admin principal").require(AdminRole.EDITOR);
    return changeStatus(
        id, expectedRevision, ContentStatus.ARCHIVED, "ARCHIVE", principal.actor());
  }

  private ContentItemView changeStatus(
      String id,
      int expectedRevision,
      ContentStatus status,
      String action,
      String actor) {
    Instant now = Instant.now(clock);
    return inTransaction(
        () -> {
          ContentItemView before = find(id);
          ContentItemView changed =
              repository.changeStatus(id, expectedRevision, status, now);
          record(actor, action, id, before, changed, now);
          return changed;
        });
  }

  private void record(
      String actor,
      String action,
      String target,
      ContentItemView before,
      ContentItemView after,
      Instant at) {
    JsonNode beforeJson = before == null ? NullNode.getInstance() : objectMapper.valueToTree(before);
    JsonNode afterJson = after == null ? NullNode.getInstance() : objectMapper.valueToTree(after);
    audit.record(actor, action, target, beforeJson, afterJson, null, true, at);
  }

  private ContentItemView inTransaction(Supplier<ContentItemView> callback) {
    ContentItemView result = transactionTemplate.execute(status -> callback.get());
    if (result == null) {
      throw new IllegalStateException("content authoring transaction returned no result");
    }
    return result;
  }

  private List<ContentItemView> currentCatalogExcluding(String excludedId) {
    return currentCatalog().stream().filter(item -> !item.id().equals(excludedId)).toList();
  }

  private List<ContentItemView> currentCatalog() {
    List<ContentItemView> catalog = new ArrayList<>();
    String cursor = null;
    do {
      List<ContentItemView> page =
          repository.search(null, null, null, null, null, cursor, 100);
      catalog.addAll(page);
      cursor = page.size() == 100 ? page.getLast().id() : null;
    } while (cursor != null);
    return List.copyOf(catalog);
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
