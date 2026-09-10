package com.childedu.chinese.content.domain;

public record MasteryRules(
    int firstLearnCap,
    int consolidationCap,
    int checkpointCap,
    int delayedReviewCap,
    int guidedPoints,
    int practicing,
    int mastered,
    int stable,
    int checkpointPassCorrect) {}
