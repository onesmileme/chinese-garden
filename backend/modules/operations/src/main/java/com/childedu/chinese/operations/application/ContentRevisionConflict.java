package com.childedu.chinese.operations.application;

public class ContentRevisionConflict extends RuntimeException {

  private final int expectedRevision;
  private final int actualRevision;

  public ContentRevisionConflict(String id, int expectedRevision, int actualRevision) {
    super(
        "content revision conflict for "
            + id
            + ": expected "
            + expectedRevision
            + ", actual "
            + actualRevision);
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }

  public int expectedRevision() {
    return expectedRevision;
  }

  public int actualRevision() {
    return actualRevision;
  }
}
