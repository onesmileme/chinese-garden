package com.childedu.chinese.learning.domain;

import com.childedu.chinese.shared.ChildProfileId;
import java.util.Map;

public record LearningEventInput(
    String eventId,
    ChildProfileId childProfileId,
    String deviceId,
    String sessionId,
    LearningEventType eventType,
    long clientSequence,
    String contentVersion,
    String ruleVersion,
    long occurredAt,
    Map<String, Object> payload) {}
