ALTER TABLE admin_audit_log
  ADD COLUMN success BOOLEAN NOT NULL AFTER reason;
