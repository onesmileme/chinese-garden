CREATE TABLE outbox_event (
  id              BIGINT NOT NULL AUTO_INCREMENT,
  aggregate_type  VARCHAR(64) NOT NULL,
  aggregate_id    VARCHAR(64) NOT NULL,
  event_type      VARCHAR(64) NOT NULL,
  payload_json    JSON NOT NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'PENDING', -- PENDING/DONE/FAILED
  attempts        INT NOT NULL DEFAULT 0,
  last_error      VARCHAR(1024) NULL,
  created_at      DATETIME(3) NOT NULL,
  updated_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_outbox_status (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
