package com.childedu.chinese.content.domain;

public record ProgressionRules(
    int maxLevel,
    int baseXpPerLevel,
    int xpStepPerLevel,
    int accuracyFull,
    int accuracyHigh,
    double accuracyHighThreshold,
    int weeklyGoalDays) {}
