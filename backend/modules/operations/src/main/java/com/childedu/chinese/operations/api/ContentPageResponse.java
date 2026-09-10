package com.childedu.chinese.operations.api;

import com.childedu.chinese.content.domain.ContentItemView;
import java.util.List;

public record ContentPageResponse(List<ContentItemView> items, String nextCursor) {

  public ContentPageResponse {
    items = List.copyOf(items);
  }
}
