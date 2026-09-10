package com.childedu.chinese.operations.domain;

/** Outbox 行快照。status ∈ {PENDING, DONE, FAILED}。 */
public record OutboxRecord(
    long id,
    String aggregateType,
    String aggregateId,
    String eventType,
    String payloadJson,
    int attempts,
    String status) {}
