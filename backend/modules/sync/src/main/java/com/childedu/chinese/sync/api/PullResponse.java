package com.childedu.chinese.sync.api;

import com.childedu.chinese.learning.domain.StoredEvent;
import java.util.List;

/** 与 Plan B PullResult 逐字一致：{events[], nextCursor}。 */
public record PullResponse(List<StoredEvent> events, long nextCursor) {}
