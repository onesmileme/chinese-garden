package com.childedu.chinese.operations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.childedu.chinese.content.domain.Character;
import com.childedu.chinese.content.domain.ContentDraft;
import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import com.childedu.chinese.content.domain.Corpus;
import com.childedu.chinese.content.domain.Idiom;
import com.childedu.chinese.content.domain.Poem;
import com.childedu.chinese.operations.application.ContentCatalogRepository;
import com.childedu.chinese.operations.application.CorpusImportService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class CorpusImportServiceTest {

  private static final Instant NOW = Instant.parse("2026-08-25T08:00:00Z");
  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Test
  void importsEachCorpusTypeOnceWithOnlyItsAuthoredPayload() throws Exception {
    RecordingCatalogRepository repository = new RecordingCatalogRepository();
    CorpusImportService service =
        new CorpusImportService(repository, MAPPER, immediateTransactionTemplate());
    Corpus corpus =
        new Corpus(
            List.of(
                new Character(
                    "hz-shan-山",
                    "山",
                    "shān",
                    "img-shan",
                    "nature",
                    3,
                    1,
                    1,
                    true,
                    ContentStatus.ACTIVE,
                    List.of("基础"),
                    1)),
            List.of(
                new Poem(
                    "sc-jingyesi",
                    "静夜思",
                    "李白",
                    List.of("床前明月光"),
                    List.of("hz-shan-山"),
                    2,
                    2,
                    false,
                    ContentStatus.DRAFT,
                    List.of("唐诗"),
                    1)),
            List.of(
                new Idiom(
                    "cy-madaochenggong",
                    "马到成功",
                    "事情顺利，很快取得成功",
                    "ma",
                    "gong",
                    3,
                    3,
                    true,
                    ContentStatus.ARCHIVED,
                    List.of("接龙"),
                    1)));

    assertThat(service.importIfEmpty(corpus, "migration", NOW)).isEqualTo(3);
    assertThat(service.importIfEmpty(corpus, "migration", NOW)).isZero();

    assertThat(repository.revisions)
        .extracting(ImportedRevision::id, ImportedRevision::type)
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("hz-shan-山", "CHARACTER"),
            org.assertj.core.groups.Tuple.tuple("sc-jingyesi", "POEM"),
            org.assertj.core.groups.Tuple.tuple("cy-madaochenggong", "IDIOM"));
    assertThat(repository.revisions)
        .allSatisfy(
            revision -> {
              assertThat(revision.revision()).isEqualTo(1);
              assertThat(revision.actor()).isEqualTo("migration");
              assertThat(revision.now()).isEqualTo(NOW);
            });

    assertThat(MAPPER.readTree(repository.revisions.get(0).payloadJson()))
        .isEqualTo(
            MAPPER.readTree(
                """
                {"char":"山","pinyin":"shān","imageId":"img-shan","theme":"nature","strokes":3}
                """));
    assertThat(MAPPER.readTree(repository.revisions.get(1).payloadJson()))
        .isEqualTo(
            MAPPER.readTree(
                """
                {"title":"静夜思","author":"李白","lines":["床前明月光"],"charRefs":["hz-shan-山"]}
                """));
    assertThat(MAPPER.readTree(repository.revisions.get(2).payloadJson()))
        .isEqualTo(
            MAPPER.readTree(
                """
                {"text":"马到成功","meaning":"事情顺利，很快取得成功","headPinyin":"ma","tailPinyin":"gong"}
                """));
  }

  private static TransactionTemplate immediateTransactionTemplate() {
    TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
    when(transactionTemplate.execute(any()))
        .thenAnswer(
            invocation ->
                invocation
                    .<TransactionCallback<Integer>>getArgument(0)
                    .doInTransaction(mock(TransactionStatus.class)));
    return transactionTemplate;
  }

  private static final class RecordingCatalogRepository implements ContentCatalogRepository {
    private final List<ImportedRevision> revisions = new ArrayList<>();

    @Override
    public ContentItemView create(ContentDraft draft, String actor, Instant now) {
      throw new UnsupportedOperationException();
    }

    @Override
    public ContentItemView update(
        String id, int expectedRevision, ContentDraft draft, String actor, Instant now) {
      throw new UnsupportedOperationException();
    }

    @Override
    public Optional<ContentItemView> find(String id) {
      return Optional.empty();
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
      return List.of();
    }

    @Override
    public ContentItemView changeStatus(
        String id, int expectedRevision, ContentStatus status, Instant now) {
      throw new UnsupportedOperationException();
    }

    @Override
    public void lockForInitialImport() {}

    @Override
    public boolean isEmpty() {
      return revisions.isEmpty();
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
        Instant now) {
      revisions.add(
          new ImportedRevision(
              id,
              type,
              status,
              revision,
              level,
              difficulty,
              promotionRequired,
              tags,
              payloadJson,
              actor,
              now));
    }

    @Override
    public void batchCreate(Collection<ContentDraft> drafts, String actor, Instant now) {}
  }

  private record ImportedRevision(
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
}
