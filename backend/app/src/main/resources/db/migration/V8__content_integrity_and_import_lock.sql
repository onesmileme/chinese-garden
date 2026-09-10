CREATE TABLE content_import_lock (
  lock_name VARCHAR(64) NOT NULL,
  PRIMARY KEY (lock_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO content_import_lock (lock_name) VALUES ('initial-corpus-import');

ALTER TABLE content_revision
  ADD CONSTRAINT fk_content_revision_item
    FOREIGN KEY (item_id) REFERENCES content_item (id);

ALTER TABLE content_release_item
  ADD CONSTRAINT fk_content_release_item_release
    FOREIGN KEY (release_version) REFERENCES content_release (version),
  ADD CONSTRAINT fk_content_release_item_revision
    FOREIGN KEY (item_id, revision) REFERENCES content_revision (item_id, revision);
