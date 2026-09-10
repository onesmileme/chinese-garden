CREATE TABLE content_item (
  id               VARCHAR(64) NOT NULL,
  type             VARCHAR(16) NOT NULL,
  status           VARCHAR(16) NOT NULL,
  current_revision INT NOT NULL,
  created_at       DATETIME(3) NOT NULL,
  updated_at       DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_content_item_filter (type, status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE content_revision (
  item_id             VARCHAR(64) NOT NULL,
  revision            INT NOT NULL,
  level               TINYINT NOT NULL,
  difficulty          TINYINT NOT NULL,
  promotion_required  BOOLEAN NOT NULL,
  tags_json            JSON NOT NULL,
  payload_json         JSON NOT NULL,
  created_by           VARCHAR(64) NOT NULL,
  created_at           DATETIME(3) NOT NULL,
  PRIMARY KEY (item_id, revision),
  CONSTRAINT chk_content_level CHECK (level BETWEEN 1 AND 5),
  CONSTRAINT chk_content_difficulty CHECK (difficulty BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE content_release_item (
  release_version VARCHAR(32) NOT NULL,
  item_id         VARCHAR(64) NOT NULL,
  revision        INT NOT NULL,
  PRIMARY KEY (release_version, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE admin_audit_log (
  id          BIGINT NOT NULL AUTO_INCREMENT,
  actor       VARCHAR(64) NOT NULL,
  action      VARCHAR(64) NOT NULL,
  target      VARCHAR(128) NOT NULL,
  before_json JSON NULL,
  after_json  JSON NULL,
  reason      VARCHAR(512) NULL,
  created_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_admin_audit_target (target, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
