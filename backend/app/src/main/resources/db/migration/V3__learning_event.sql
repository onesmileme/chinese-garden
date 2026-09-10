CREATE TABLE learning_session (
  id                VARCHAR(26) NOT NULL,
  child_profile_id  VARCHAR(26) NOT NULL,
  kind              VARCHAR(16) NOT NULL,         -- ASSESSMENT / DAILY
  content_version   VARCHAR(32) NOT NULL,
  created_at        DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_session_child (child_profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE learning_event (
  event_id          VARCHAR(26) NOT NULL,         -- 客户端 ULID
  child_profile_id  VARCHAR(26) NOT NULL,
  device_id         VARCHAR(64) NOT NULL,
  session_id        VARCHAR(26) NOT NULL,
  event_type        VARCHAR(32) NOT NULL,
  client_sequence   BIGINT NOT NULL,
  content_version   VARCHAR(32) NOT NULL,
  rule_version      VARCHAR(32) NOT NULL,
  occurred_at       BIGINT NOT NULL,              -- 客户端毫秒时间戳
  received_at       DATETIME(3) NOT NULL,
  payload_json      JSON NOT NULL,
  server_offset     BIGINT NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (server_offset),
  UNIQUE KEY uk_event_id (event_id),              -- 幂等去重的核心约束
  KEY idx_event_child_offset (child_profile_id, server_offset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
