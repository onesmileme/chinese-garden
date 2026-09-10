package com.childedu.chinese.operations.application;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;

/** 管理操作审计端口；before/after 不得包含认证令牌或儿童个人信息。 */
public interface AuditLog {

  void record(
      String actor,
      String action,
      String target,
      JsonNode before,
      JsonNode after,
      String reason,
      boolean success,
      Instant at);
}
