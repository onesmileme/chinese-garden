package com.childedu.chinese.operations.application;

import com.childedu.chinese.content.domain.ContentDraft;
import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.ContentType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ContentCatalogRepository {

  ContentItemView create(ContentDraft draft, String actor, Instant now);

  ContentItemView update(
      String id, int expectedRevision, ContentDraft draft, String actor, Instant now);

  Optional<ContentItemView> find(String id);

  List<ContentItemView> search(
      ContentType type,
      ContentLevel level,
      ContentStatus status,
      String tag,
      String keyword,
      String cursor,
      int limit);

  default List<ContentItemView> activeCatalogSnapshot() {
    throw new UnsupportedOperationException("active catalog snapshot is not supported");
  }

  ContentItemView changeStatus(
      String id, int expectedRevision, ContentStatus status, Instant now);

  void lockForInitialImport();

  boolean isEmpty();

  void importRevision(
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
      Instant now);

  void batchCreate(Collection<ContentDraft> drafts, String actor, Instant now);
}
