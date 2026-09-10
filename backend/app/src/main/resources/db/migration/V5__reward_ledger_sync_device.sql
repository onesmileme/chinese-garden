CREATE TABLE reward_ledger (
  event_id          VARCHAR(26) NOT NULL,         -- 幂等键：同一事件只入账一次
  child_profile_id  VARCHAR(26) NOT NULL,
  reward_type       VARCHAR(32) NOT NULL,
  amount            INT NOT NULL,
  created_at        DATETIME(3) NOT NULL,
  PRIMARY KEY (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sync_device (
  device_id             VARCHAR(64) NOT NULL,
  child_profile_id      VARCHAR(26) NOT NULL,
  last_ack_server_offset BIGINT NOT NULL DEFAULT 0,
  updated_at            DATETIME(3) NOT NULL,
  PRIMARY KEY (device_id, child_profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
