CREATE TABLE admin_principal (
  actor        VARCHAR(64) NOT NULL,
  token_sha256 CHAR(64) NOT NULL,
  roles_json   JSON NOT NULL,
  status       VARCHAR(16) NOT NULL,
  created_at   DATETIME(3) NOT NULL,
  updated_at   DATETIME(3) NOT NULL,
  PRIMARY KEY (actor),
  UNIQUE KEY uk_admin_token_sha256 (token_sha256),
  CONSTRAINT chk_admin_principal_status
    CHECK (status IN ('ACTIVE', 'DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
