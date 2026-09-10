CREATE TABLE content_release_artifact (
  release_version VARCHAR(32) NOT NULL,
  level TINYINT NOT NULL,
  artifact_url VARCHAR(512) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  file_size BIGINT NOT NULL,
  format VARCHAR(16) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (release_version, level),
  CONSTRAINT chk_release_artifact_level CHECK (level BETWEEN 1 AND 5),
  CONSTRAINT chk_release_artifact_size CHECK (file_size > 0),
  CONSTRAINT fk_release_artifact_release
    FOREIGN KEY (release_version) REFERENCES content_release (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE content_release
  ADD COLUMN progression_rule_version VARCHAR(32) NOT NULL DEFAULT 'progression-v1',
  ADD COLUMN content_level_rule_version VARCHAR(32) NOT NULL DEFAULT 'content-level-v1',
  MODIFY manifest_url VARCHAR(512) NULL,
  MODIFY sha256 CHAR(64) NULL,
  MODIFY file_size BIGINT NULL;
