package com.childedu.chinese.progression.domain;

import java.util.List;

public record ProgressionState(
    int level, long lifetimeXp, int xpIntoLevel, List<String> appliedEventIds) {}
