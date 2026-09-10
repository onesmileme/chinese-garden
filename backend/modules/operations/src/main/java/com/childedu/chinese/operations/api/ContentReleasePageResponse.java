package com.childedu.chinese.operations.api;

import com.childedu.chinese.operations.application.ContentReleasePage;
import java.util.List;

public record ContentReleasePageResponse(
    List<ContentReleaseSummaryResponse> items, String nextCursor) {

  public ContentReleasePageResponse {
    items = List.copyOf(items);
  }

  public static ContentReleasePageResponse from(ContentReleasePage page) {
    return new ContentReleasePageResponse(
        page.items().stream().map(ContentReleaseSummaryResponse::from).toList(),
        page.nextCursor());
  }
}
