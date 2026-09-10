package com.childedu.chinese.sync.infrastructure;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** sync_device 幂等 upsert：记录设备已确认到的 server_offset。 */
@Repository
public class JdbcSyncDeviceRepository {

  private final JdbcTemplate jdbc;

  public JdbcSyncDeviceRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void recordAck(String deviceId, String childProfileId, long serverOffset) {
    jdbc.update(
        """
        INSERT INTO sync_device (device_id, child_profile_id, last_ack_server_offset, updated_at)
        VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE
          last_ack_server_offset = GREATEST(last_ack_server_offset, VALUES(last_ack_server_offset)),
          updated_at = VALUES(updated_at)
        """,
        deviceId,
        childProfileId,
        serverOffset,
        Timestamp.from(Instant.now()));
  }

  public long lastAck(String deviceId, String childProfileId) {
    Long v =
        jdbc.queryForObject(
            "SELECT COALESCE(MAX(last_ack_server_offset),0) FROM sync_device "
                + "WHERE device_id = ? AND child_profile_id = ?",
            Long.class,
            deviceId,
            childProfileId);
    return v == null ? 0 : v;
  }
}
