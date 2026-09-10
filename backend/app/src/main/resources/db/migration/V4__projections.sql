CREATE TABLE mastery_projection (
  child_profile_id     VARCHAR(26) NOT NULL,
  knowledge_point_id   VARCHAR(64) NOT NULL,
  score                INT NOT NULL,
  status               VARCHAR(16) NOT NULL,
  rule_version         VARCHAR(32) NOT NULL,
  last_event_offset    BIGINT NOT NULL,
  updated_at           DATETIME(3) NOT NULL,
  PRIMARY KEY (child_profile_id, knowledge_point_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE progression_projection (
  child_profile_id   VARCHAR(26) NOT NULL,
  level              INT NOT NULL,
  lifetime_xp        BIGINT NOT NULL,
  xp_into_level      INT NOT NULL,
  rule_version       VARCHAR(32) NOT NULL,
  last_event_offset  BIGINT NOT NULL,
  updated_at         DATETIME(3) NOT NULL,
  PRIMARY KEY (child_profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
