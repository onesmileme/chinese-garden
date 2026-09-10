package com.childedu.chinese.operations.api;

public record CreateReleaseRequest(
    String version,
    String masteryRuleVersion,
    String progressionRuleVersion,
    String contentLevelRuleVersion,
    String minClientVersion) {}
