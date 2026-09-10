package com.childedu.chinese.learning.domain;

import com.childedu.chinese.shared.ChildProfileId;
import java.util.Map;

public record StoredEvent(
    String eventId,
    ChildProfileId childProfileId,
    String deviceId,
    String sessionId,
    LearningEventType eventType,
    long clientSequence,
    String contentVersion,
    String ruleVersion,
    long occurredAt,
    long serverOffset,
    Map<String, Object> payload) {}
