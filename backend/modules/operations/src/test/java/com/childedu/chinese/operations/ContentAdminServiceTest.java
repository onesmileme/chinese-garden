package com.childedu.chinese.operations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import com.childedu.chinese.content.domain.ReleaseSnapshot;
import com.childedu.chinese.content.domain.ReleaseStatus;
import com.childedu.chinese.operations.api.ReleaseSnapshotResponse;
import com.childedu.chinese.operations.api.RegisterReleaseRequest;
import com.childedu.chinese.operations.application.AuditLog;
import com.childedu.chinese.operations.application.ContentAdminService;
import com.childedu.chinese.operations.application.ContentReleaseAdminRepository;
import com.childedu.chinese.operations.application.ContentReleasePage;
import com.childedu.chinese.operations.application.ContentReleaseSummary;
import com.fasterxml.jackson.databind.node.NullNode;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class ContentAdminServiceTest {

  private static final Instant NOW = Instant.parse("2026-07-21T00:00:00Z");

  private final ContentReleaseAdminRepository repository =
      mock(ContentReleaseAdminRepository.class);
  private final AuditLog audit = mock(AuditLog.class);
  private final ContentAdminService service =
      new ContentAdminService(
          repository,
          audit,
          Clock.fixed(NOW, ZoneOffset.UTC),
          immediateTransactionTemplate());
  private final RegisterReleaseRequest request =
      new RegisterReleaseRequest(
          "corpus-v1",
          "mastery-v1",
          "https://example/release.tgz",
          "a".repeat(64),
          512L,
          "1.0.0");

  @Test
  void registerCreatesDraftAndAuditsSuccess() {
    when(repository.statusOf("corpus-v1")).thenReturn(Optional.empty());

    service.register(request, "teacher-1");

    verify(repository).insertDraft(request, NOW);
    verify(audit)
        .record(
            "teacher-1",
            "REGISTER",
            "corpus-v1",
            NullNode.getInstance(),
            NullNode.getInstance(),
            null,
            true,
            NOW);
  }

  @Test
  void searchesReleasesWithNormalizedCursor() {
    ContentReleasePage page = new ContentReleasePage(java.util.List.of(), null);
    when(repository.search(ReleaseStatus.DRAFT, null, 20)).thenReturn(page);

    assertThat(service.search(ReleaseStatus.DRAFT, " ", 20)).isSameAs(page);
  }

  @Test
  void rejectsReleasePageLimitsOutsideOneToOneHundred() {
    assertThatThrownBy(() -> service.search(null, null, 0))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("release page limit must be in 1..100");
    assertThatThrownBy(() -> service.search(null, null, 101))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("release page limit must be in 1..100");

    verify(repository, never()).search(any(), any(), anyInt());
  }

  @Test
  void returnsCompleteReleaseDetails() {
    ReleaseSnapshot snapshot =
        new ReleaseSnapshot(
            "corpus-v6",
            "mastery-v1",
            "progression-v1",
            "content-level-v1",
            "1.0.0",
            List.of());
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
    when(repository.snapshot("corpus-v6")).thenReturn(snapshot);
    when(repository.summary("corpus-v6"))
        .thenReturn(
            new ContentReleaseSummary(
                "corpus-v6",
                "mastery-v1",
                "progression-v1",
                "content-level-v1",
                "1.0.0",
                ReleaseStatus.VALIDATED,
                1,
                NOW,
                null));
    when(repository.artifacts("corpus-v6")).thenReturn(List.of(artifact));

    ReleaseSnapshotResponse details = service.snapshot("corpus-v6");

    assertThat(details.status()).isEqualTo(ReleaseStatus.VALIDATED);
    assertThat(details.artifacts()).containsExactly(artifact);
  }

  @Test
  void duplicateRegisterIsRejectedAndAudited() {
    when(repository.statusOf("corpus-v1")).thenReturn(Optional.of(ReleaseStatus.DRAFT));

    assertThatThrownBy(() -> service.register(request, "teacher-1"))
        .isInstanceOf(IllegalStateException.class);

    verify(repository, never()).insertDraft(any(), any());
    verify(audit)
        .record(
            "teacher-1",
            "REGISTER",
            "corpus-v1",
            NullNode.getInstance(),
            NullNode.getInstance(),
            "content release already exists: corpus-v1",
            false,
            NOW);
  }

  @Test
  void onlyAdjacentTransitionsAreWritten() {
    when(repository.statusOf("corpus-v1")).thenReturn(Optional.of(ReleaseStatus.DRAFT));

    service.transition("corpus-v1", "VALIDATED", "teacher-1");

    verify(repository).updateStatus("corpus-v1", ReleaseStatus.VALIDATED, NOW);
    assertThatThrownBy(() -> service.transition("corpus-v1", "PUBLISHED", "teacher-1"))
        .isInstanceOf(IllegalStateException.class);
    verify(audit)
        .record(
            "teacher-1",
            "TRANSITION:VALIDATED",
            "corpus-v1",
            NullNode.getInstance(),
            NullNode.getInstance(),
            null,
            true,
            NOW);
    verify(audit)
        .record(
            "teacher-1",
            "TRANSITION:PUBLISHED",
            "corpus-v1",
            NullNode.getInstance(),
            NullNode.getInstance(),
            "invalid content release transition: DRAFT -> PUBLISHED",
            false,
            NOW);
  }

  @Test
  void publishedVersionCannotBeReregistered() {
    when(repository.statusOf("corpus-v1")).thenReturn(Optional.of(ReleaseStatus.PUBLISHED));

    assertThatThrownBy(() -> service.register(request, "teacher-1"))
        .isInstanceOf(IllegalStateException.class);

    verify(repository, never()).insertDraft(any(), any());
    verify(audit)
        .record(
            "teacher-1",
            "REGISTER",
            "corpus-v1",
            NullNode.getInstance(),
            NullNode.getInstance(),
            "content release already exists: corpus-v1",
            false,
            NOW);
  }

  @Test
  void invalidRequestsAndActorsAreRejectedAndAudited() {
    RegisterReleaseRequest invalid =
        new RegisterReleaseRequest(
            "corpus-v1",
            "mastery-v1",
            "https://example/release.tgz",
            "A".repeat(64),
            0L,
            "1.0.0");

    assertThatThrownBy(() -> service.register(invalid, "teacher-1"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> service.register(request, " "))
        .isInstanceOf(IllegalArgumentException.class);

    verify(repository, never()).statusOf(any());
    verify(audit)
        .record(
            "teacher-1",
            "REGISTER",
            "corpus-v1",
            NullNode.getInstance(),
            NullNode.getInstance(),
            "sha256 must be 64 lowercase hexadecimal characters",
            false,
            NOW);
    verify(audit)
        .record(
            " ",
            "REGISTER",
            "corpus-v1",
            NullNode.getInstance(),
            NullNode.getInstance(),
            "actor must not be blank",
            false,
            NOW);
  }

  @Test
  void invalidAndMissingTransitionsAreRejectedAndAudited() {
    when(repository.statusOf("corpus-v1")).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.transition("corpus-v1", "unknown", "teacher-1"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> service.transition("corpus-v1", "VALIDATED", "teacher-1"))
        .isInstanceOf(IllegalStateException.class);

    verify(repository, never()).updateStatus(any(), any(), any());
    verify(audit)
        .record(
            "teacher-1",
            "TRANSITION:unknown",
            "corpus-v1",
            NullNode.getInstance(),
            NullNode.getInstance(),
            "unknown release status: unknown",
            false,
            NOW);
    verify(audit)
        .record(
            "teacher-1",
            "TRANSITION:VALIDATED",
            "corpus-v1",
            NullNode.getInstance(),
            NullNode.getInstance(),
            "content release not found: corpus-v1",
            false,
            NOW);
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
}
