package com.childedu.chinese.sync.application;

import com.childedu.chinese.learning.application.LearningEventAppender;
import com.childedu.chinese.learning.domain.AppendOutcome;
import com.childedu.chinese.learning.domain.StoredEvent;
import com.childedu.chinese.sync.api.PullResponse;
import com.childedu.chinese.sync.api.PushRequest;
import com.childedu.chinese.sync.api.PushResponse;
import java.util.List;
import org.springframework.stereotype.Service;

/** 同步编排：push 转发到 learning 幂等写入；pull 按 server_offset 推进游标。 */
@Service
public class SyncService {

  private final LearningEventAppender appender;

  public SyncService(LearningEventAppender appender) {
    this.appender = appender;
  }

  public PushResponse push(PushRequest request) {
    AppendOutcome outcome = appender.appendBatch(request.events());
    return new PushResponse(
        outcome.accepted(), outcome.duplicated(), outcome.rejected(), outcome.serverOffset());
  }

  public PullResponse pull(long cursor, int limit) {
    int capped = Math.min(limit, LearningEventAppender.MAX_BATCH);
    List<StoredEvent> events = appender.pull(cursor, capped);
    long nextCursor =
        events.isEmpty() ? cursor : events.get(events.size() - 1).serverOffset();
    return new PullResponse(events, nextCursor);
  }
}
