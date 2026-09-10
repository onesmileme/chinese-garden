package com.childedu.chinese.operations.api;

/** 发布候选元数据。内容正文由对象存储中的不可变 payload 持有。 */
public record RegisterReleaseRequest(
    String version,
    String ruleVersion,
    String manifestUrl,
    String sha256,
    long fileSize,
    String minClientVersion) {}
