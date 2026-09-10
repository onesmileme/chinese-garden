package com.childedu.chinese.mastery.domain;

import java.util.List;

public record MasteryEvidence(
    boolean guidedCompleted,
    int firstLearnFirstCorrect,
    int firstLearnTotal,
    List<Boolean> consolidationOutcomes,
    int checkpointFirstCorrect,
    List<DelayedReviewSession> delayedReviewSessions,
    boolean delayedReviewFailing) {}
