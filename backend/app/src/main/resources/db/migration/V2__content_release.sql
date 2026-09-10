CREATE TABLE content_release (
  version           VARCHAR(32) NOT NULL,
  rule_version      VARCHAR(32) NOT NULL,
  manifest_url      VARCHAR(512) NOT NULL,
  sha256            CHAR(64) NOT NULL,
  file_size         BIGINT NOT NULL,
  min_client_version VARCHAR(16) NOT NULL,
  status            VARCHAR(16) NOT NULL,         -- DRAFT/VALIDATED/PUBLISHED/RETIRED
  created_at        DATETIME(3) NOT NULL,
  published_at      DATETIME(3) NULL,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
