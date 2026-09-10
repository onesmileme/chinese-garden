package com.childedu.chinese.operations.application;

import com.childedu.chinese.content.domain.ContentIssue;
import java.util.List;

public final class ContentValidationException extends RuntimeException {

  private final List<ContentIssue> issues;

  public ContentValidationException(List<ContentIssue> issues) {
    super("content validation failed with " + issues.size() + " issue(s)");
    if (issues.isEmpty()) {
      throw new IllegalArgumentException("content validation issues must not be empty");
    }
    this.issues = List.copyOf(issues);
  }

  public List<ContentIssue> issues() {
    return issues;
  }
}
