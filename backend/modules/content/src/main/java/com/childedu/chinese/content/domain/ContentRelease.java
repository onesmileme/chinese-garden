package com.childedu.chinese.content.domain;

import com.childedu.chinese.shared.ContentVersion;
import com.childedu.chinese.shared.RuleVersion;

/** 不可变发布记录（已发布版本不可原地修改，spec §20）。 */
public record ContentRelease(
    ContentVersion version,
    RuleVersion ruleVersion,
    String manifestUrl,
    String sha256,
    long fileSize,
    String minClientVersion,
    ReleaseStatus status) {}
