package com.childedu.chinese.content.domain;

public record ContentIssue(
    ContentIssueCode code, String itemId, String path, String message) {}
