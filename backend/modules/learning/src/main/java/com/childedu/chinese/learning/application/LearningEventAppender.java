package com.childedu.chinese.learning.application;

import com.childedu.chinese.learning.domain.AppendOutcome;
import com.childedu.chinese.learning.domain.LearningEventInput;
import com.childedu.chinese.learning.domain.StoredEvent;
import com.childedu.chinese.learning.infrastructure.JdbcLearningEventRepository;
import com.childedu.chinese.shared.Ulid;
import java.util.ArrayList;
import java.util.List;

/** 幂等批量写入用例（spec §19：<=100，返回 accepted/duplicated/rejected）。 */
public class LearningEventAppender {

  public static final int MAX_BATCH = 100;

  private final JdbcLearningEventRepository repository;

  public LearningEventAppender(JdbcLearningEventRepository repository) {
    this.repository = repository;
  }

  public AppendOutcome appendBatch(List<LearningEventInput> events) {
    if (events.size() > MAX_BATCH) {
      throw new IllegalArgumentException("batch exceeds " + MAX_BATCH);
    }
    List<String> accepted = new ArrayList<>();
    List<String> duplicated = new ArrayList<>();
    List<String> rejected = new ArrayList<>();

    for (LearningEventInput e : events) {
      if (!Ulid.isValid(e.eventId())) {
        rejected.add(e.eventId());
        continue;
      }
      boolean inserted = repository.tryInsert(e);
      if (inserted) {
        accepted.add(e.eventId());
      } else {
        duplicated.add(e.eventId());
      }
    }
    return new AppendOutcome(accepted, duplicated, rejected, repository.maxServerOffset());
  }

  public List<StoredEvent> pull(long cursor, int limit) {
    return repository.pull(cursor, Math.min(limit, MAX_BATCH));
  }
}
