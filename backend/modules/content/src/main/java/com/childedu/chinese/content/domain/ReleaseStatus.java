package com.childedu.chinese.content.domain;

/** 内容版本状态机（spec §20：DRAFT → VALIDATED → PUBLISHED → RETIRED，只能向前）。 */
public enum ReleaseStatus {
  DRAFT,
  VALIDATED,
  PUBLISHED,
  RETIRED;

  public boolean canTransitionTo(ReleaseStatus next) {
    return next.ordinal() == this.ordinal() + 1;
  }
}
