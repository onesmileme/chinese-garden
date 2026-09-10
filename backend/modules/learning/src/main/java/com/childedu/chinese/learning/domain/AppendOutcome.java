package com.childedu.chinese.learning.domain;

import java.util.List;

public record AppendOutcome(
    List<String> accepted, List<String> duplicated, List<String> rejected, long serverOffset) {}
