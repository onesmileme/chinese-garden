package com.childedu.chinese.operations.application;

import com.childedu.chinese.content.domain.ContentItemView;
import com.childedu.chinese.content.domain.ContentReleaseArtifact;
import com.childedu.chinese.content.domain.ReleaseSnapshot;
import com.childedu.chinese.content.domain.ReleaseStatus;
import com.childedu.chinese.operations.api.CreateReleaseRequest;
import com.childedu.chinese.operations.api.RegisterReleaseRequest;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** 内容发布元数据的持久化端口。 */
public interface ContentReleaseAdminRepository {

  ContentReleasePage search(ReleaseStatus status, String cursor, int limit);

  ContentReleaseSummary summary(String version);

  Optional<ReleaseStatus> statusOf(String version);

  void insertDraft(RegisterReleaseRequest request, Instant now);

  ReleaseSnapshot createSnapshot(
      CreateReleaseRequest request, List<ContentItemView> items, Instant now);

  ReleaseSnapshot snapshot(String version);

  void registerArtifacts(
      String version, List<ContentReleaseArtifact> artifacts, Instant now);

  List<ContentReleaseArtifact> artifacts(String version);

  void updateStatus(String version, ReleaseStatus next, Instant now);
}
