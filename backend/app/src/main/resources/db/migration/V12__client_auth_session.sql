CREATE TABLE refresh_session (
  jti_sha256    CHAR(64) NOT NULL,
  principal_id  VARCHAR(26) NOT NULL,
  expires_at    DATETIME(3) NOT NULL,
  revoked_at    DATETIME(3) NULL,
  created_at    DATETIME(3) NOT NULL,
  PRIMARY KEY (jti_sha256),
  KEY idx_refresh_principal (principal_id, expires_at),
  CONSTRAINT fk_refresh_principal
    FOREIGN KEY (principal_id) REFERENCES principal (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE progression_projection
  ADD CONSTRAINT chk_progression_level CHECK (level BETWEEN 1 AND 5);
