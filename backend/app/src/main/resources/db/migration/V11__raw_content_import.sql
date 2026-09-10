CREATE TABLE content_import_batch (
  id               CHAR(26) NOT NULL,
  rule_version     VARCHAR(32) NOT NULL,
  status           VARCHAR(16) NOT NULL,
  requested_json   JSON NOT NULL,
  result_json      JSON NULL,
  created_by       VARCHAR(64) NOT NULL,
  started_at       DATETIME(3) NOT NULL,
  completed_at     DATETIME(3) NULL,
  PRIMARY KEY (id)
);

CREATE TABLE content_import_candidate (
  batch_id         CHAR(26) NOT NULL,
  import_key       VARCHAR(512) NOT NULL,
  item_id          VARCHAR(64) NULL,
  content_type     VARCHAR(16) NOT NULL,
  source_name      VARCHAR(32) NOT NULL,
  source_ref       VARCHAR(512) NOT NULL,
  source_hash      CHAR(64) NOT NULL,
  decision         VARCHAR(24) NOT NULL,
  reason_code      VARCHAR(64) NULL,
  score            INT NULL,
  created_at       DATETIME(3) NOT NULL,
  PRIMARY KEY (batch_id, import_key),
  KEY idx_import_candidate_item (item_id),
  CONSTRAINT fk_import_candidate_batch
    FOREIGN KEY (batch_id) REFERENCES content_import_batch (id)
);