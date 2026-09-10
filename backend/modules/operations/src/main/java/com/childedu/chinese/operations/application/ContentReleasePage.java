package com.childedu.chinese.operations.application;

import java.util.List;

public record ContentReleasePage(List<ContentReleaseSummary> items, String nextCursor) {

  public ContentReleasePage {
    items = List.copyOf(items);
  }
}
