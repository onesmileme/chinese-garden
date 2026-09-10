package com.childedu.chinese.sync.api;

import com.childedu.chinese.learning.domain.LearningEventInput;
import java.util.List;

/** 与 Plan B SyncClient.push 入参逐字一致：events[]（<=100）。 */
public record PushRequest(List<LearningEventInput> events) {}
