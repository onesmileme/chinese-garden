package com.childedu.chinese.operations.application;

import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ReleaseSnapshot;
import com.childedu.chinese.content.domain.ReleaseStatus;
import com.childedu.chinese.operations.api.CreateReleaseRequest;
import com.childedu.chinese.operations.api.ReleaseSnapshotResponse;
import com.childedu.chinese.operations.api.RegisterArtifactsRequest;
import com.childedu.chinese.operations.api.RegisterReleaseRequest;
import com.fasterxml.jackson.databind.node.NullNode;
import java.time.Clock;
import java.time.Instant;
import java.net.URI;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;
import org.springframework.transaction.support.TransactionTemplate;

/** 受审核的发布登记和状态迁移服务，不依赖 HTTP 或 JDBC。 */
public class ContentAdminService {

  private static final Pattern SHA_256 = Pattern.compile("[0-9a-f]{64}");

  private final ContentReleaseAdminRepository repository;
  private final ContentCatalogRepository catalog;
  private final AuditLog audit;
  private final Clock clock;
  private final TransactionTemplate transactionTemplate;

  public ContentAdminService(
      ContentReleaseAdminRepository repository,
      AuditLog audit,
      Clock clock,
      TransactionTemplate transactionTemplate) {
    this(repository, null, audit, clock, transactionTemplate);
  }

  public ContentAdminService(
      ContentReleaseAdminRepository repository,
      ContentCatalogRepository catalog,
      AuditLog audit,
      Clock clock,
      TransactionTemplate transactionTemplate) {
    this.repository = Objects.requireNonNull(repository, "content release repository");
    this.catalog = catalog;
    this.audit = Objects.requireNonNull(audit, "audit log");
    this.clock = Objects.requireNonNull(clock, "content admin clock");
    this.transactionTemplate =
        Objects.requireNonNull(transactionTemplate, "transaction template");
  }

  public ReleaseSnapshot createSnapshot(CreateReleaseRequest request, String actor) {
    return transactionTemplate.execute(
        status -> {
          requireNonBlank(actor, "actor");
          validateSnapshotRequest(request);
          if (repository.statusOf(request.version()).isPresent()) {
            throw new IllegalStateException(
                "content release already exists: " + request.version());
          }
          if (catalog == null) {
            throw new IllegalStateException("content catalog unavailable");
          }
          return repository.createSnapshot(
              request, catalog.activeCatalogSnapshot(), Instant.now(clock));
        });
  }

  public ContentReleasePage search(ReleaseStatus status, String cursor, int limit) {
    if (limit < 1 || limit > 100) {
      throw new IllegalArgumentException("release page limit must be in 1..100");
    }
    return repository.search(status, blankToNull(cursor), limit);
  }

  public ReleaseSnapshotResponse snapshot(String version) {
    requireNonBlank(version, "version");
    return ReleaseSnapshotResponse.from(
        repository.snapshot(version), repository.summary(version), repository.artifacts(version));
  }

  public void registerArtifacts(
      String version, RegisterArtifactsRequest request, String actor) {
    transactionTemplate.execute(
        status -> {
          requireNonBlank(actor, "actor");
          requireNonBlank(version, "version");
          ReleaseSnapshot snapshot = repository.snapshot(version);
          if (repository.statusOf(version).orElseThrow() != ReleaseStatus.DRAFT) {
            throw new IllegalStateException("artifacts require a draft release");
          }
          if (request == null || request.artifacts().size() != ContentLevel.values().length) {
            throw new IllegalArgumentException("exactly five artifacts are required");
          }
          List<ContentReleaseArtifact> artifacts =
              request.artifacts().stream()
                  .map(input -> toArtifact(snapshot, input))
                  .toList();
          repository.registerArtifacts(version, artifacts, Instant.now(clock));
          return null;
        });
  }

  public void register(RegisterReleaseRequest request, String actor) {
    String version = request == null ? "" : request.version();
    try {
      transactionTemplate.execute(
          status -> {
            requireNonBlank(actor, "actor");
            validateRequest(request);
            if (repository.statusOf(request.version()).isPresent()) {
              throw new IllegalStateException(
                  "content release already exists: " + request.version());
            }
            Instant now = Instant.now(clock);
            repository.insertDraft(request, now);
            audit.record(
                actor,
                "REGISTER",
                version,
                NullNode.getInstance(),
                NullNode.getInstance(),
                null,
                true,
                now);
            return null;
          });
    } catch (RuntimeException e) {
      recordFailure(actor, "REGISTER", version, e);
      throw e;
    }
  }

  public void transition(String version, String toStatus, String actor) {
    String action = "TRANSITION:" + toStatus;
    try {
      transactionTemplate.execute(
          status -> {
            requireNonBlank(actor, "actor");
            requireNonBlank(version, "version");
            ReleaseStatus next = parseStatus(toStatus);
            ReleaseStatus current =
                repository
                    .statusOf(version)
                    .orElseThrow(
                        () ->
                            new IllegalStateException(
                                "content release not found: " + version));
            if (!current.canTransitionTo(next)) {
              throw new IllegalStateException(
                  "invalid content release transition: " + current + " -> " + next);
            }
            if (next == ReleaseStatus.PUBLISHED
                && repository.artifacts(version).size() != ContentLevel.values().length) {
              throw new IllegalStateException("all five artifacts are required before publish");
            }
            Instant now = Instant.now(clock);
            repository.updateStatus(version, next, now);
            audit.record(
                actor,
                action,
                version,
                NullNode.getInstance(),
                NullNode.getInstance(),
                null,
                true,
                now);
            return null;
          });
    } catch (RuntimeException e) {
      recordFailure(actor, action, version == null ? "" : version, e);
      throw e;
    }
  }

  private void recordFailure(
      String actor, String action, String target, RuntimeException originalFailure) {
    try {
      audit.record(
          actor,
          action,
          target,
          NullNode.getInstance(),
          NullNode.getInstance(),
          originalFailure.getMessage(),
          false,
          Instant.now(clock));
    } catch (RuntimeException auditFailure) {
      originalFailure.addSuppressed(auditFailure);
    }
  }

  private static void validateRequest(RegisterReleaseRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("request must not be null");
    }
    requireNonBlank(request.version(), "version");
    requireNonBlank(request.ruleVersion(), "ruleVersion");
    requireNonBlank(request.manifestUrl(), "manifestUrl");
    requireNonBlank(request.sha256(), "sha256");
    requireNonBlank(request.minClientVersion(), "minClientVersion");
    if (!SHA_256.matcher(request.sha256()).matches()) {
      throw new IllegalArgumentException("sha256 must be 64 lowercase hexadecimal characters");
    }
    if (request.fileSize() <= 0) {
      throw new IllegalArgumentException("fileSize must be positive");
    }
  }

  private static void validateSnapshotRequest(CreateReleaseRequest request) {
    if (request == null) {
      throw new IllegalArgumentException("request must not be null");
    }
    requireNonBlank(request.version(), "version");
    requireNonBlank(request.masteryRuleVersion(), "masteryRuleVersion");
    requireNonBlank(request.progressionRuleVersion(), "progressionRuleVersion");
    requireNonBlank(request.contentLevelRuleVersion(), "contentLevelRuleVersion");
    requireNonBlank(request.minClientVersion(), "minClientVersion");
  }

  private static ContentReleaseArtifact toArtifact(
      ReleaseSnapshot snapshot, RegisterArtifactsRequest.ArtifactInput input) {
    if (input == null
        || !SHA_256.matcher(Objects.toString(input.sha256(), "")).matches()
        || input.fileSize() <= 0
        || !"tar+gzip".equals(input.format())) {
      throw new IllegalArgumentException("invalid release artifact");
    }
    URI uri = URI.create(input.artifactUrl());
    if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
      throw new IllegalArgumentException("artifactUrl must be an absolute HTTPS URL");
    }
    return new ContentReleaseArtifact(
        snapshot.version(),
        ContentLevel.fromValue(input.level()),
        input.artifactUrl(),
        input.sha256(),
        input.fileSize(),
        input.format(),
        snapshot.masteryRuleVersion(),
        snapshot.progressionRuleVersion(),
        snapshot.contentLevelRuleVersion(),
        snapshot.minClientVersion());
  }

  private static ReleaseStatus parseStatus(String toStatus) {
    requireNonBlank(toStatus, "toStatus");
    try {
      return ReleaseStatus.valueOf(toStatus);
    } catch (IllegalArgumentException e) {
      throw new IllegalArgumentException("unknown release status: " + toStatus, e);
    }
  }

  private static void requireNonBlank(String value, String name) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(name + " must not be blank");
    }
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
