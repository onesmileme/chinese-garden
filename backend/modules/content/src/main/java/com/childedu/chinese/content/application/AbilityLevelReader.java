package com.childedu.chinese.content.application;

import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.shared.ChildProfileId;
import java.util.Optional;

@FunctionalInterface
public interface AbilityLevelReader {
  Optional<ContentLevel> levelOf(ChildProfileId childId);
}
