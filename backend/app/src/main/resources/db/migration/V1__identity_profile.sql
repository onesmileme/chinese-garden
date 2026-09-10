CREATE TABLE principal (
  id                        VARCHAR(26) NOT NULL,
  status                    VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  merged_into_principal_id  VARCHAR(26) NULL,
  created_at                DATETIME(3) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE external_identity (
  id               BIGINT NOT NULL AUTO_INCREMENT,
  principal_id     VARCHAR(26) NOT NULL,
  platform         VARCHAR(16) NOT NULL,
  platform_app_id  VARCHAR(64) NOT NULL,
  external_user_id VARCHAR(128) NOT NULL,
  created_at       DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ext_identity (platform, platform_app_id, external_user_id),
  KEY idx_ext_principal (principal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE child_profile (
  id                  VARCHAR(26) NOT NULL,
  nickname            VARCHAR(64) NULL,
  grade_band          VARCHAR(16) NOT NULL,
  birth_year_month    VARBINARY(255) NULL,        -- 加密后密文
  created_at          DATETIME(3) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE principal_child (
  principal_id      VARCHAR(26) NOT NULL,
  child_profile_id  VARCHAR(26) NOT NULL,
  role              VARCHAR(16) NOT NULL DEFAULT 'GUARDIAN',
  created_at        DATETIME(3) NOT NULL,
  PRIMARY KEY (principal_id, child_profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
