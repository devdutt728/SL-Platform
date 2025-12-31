-- Sprint attachments stored in Drive (metadata only)

CREATE TABLE IF NOT EXISTS rec_sprint_attachment (
  sprint_attachment_id INT NOT NULL AUTO_INCREMENT,
  drive_file_id VARCHAR(128) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  content_type VARCHAR(128) NULL,
  file_size INT NULL,
  sha256 CHAR(64) NULL,
  created_by_person_id_platform VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sprint_attachment_id),
  UNIQUE KEY uk_rec_sprint_attachment_drive_file (drive_file_id),
  KEY idx_rec_sprint_attachment_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rec_sprint_template_attachment (
  sprint_template_attachment_id INT NOT NULL AUTO_INCREMENT,
  sprint_template_id INT NOT NULL,
  sprint_attachment_id INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sprint_template_attachment_id),
  KEY idx_rec_sprint_template_attachment_template (sprint_template_id),
  KEY idx_rec_sprint_template_attachment_active (is_active),
  CONSTRAINT fk_rec_sprint_template_attachment_template
    FOREIGN KEY (sprint_template_id) REFERENCES rec_sprint_template(sprint_template_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_rec_sprint_template_attachment_attachment
    FOREIGN KEY (sprint_attachment_id) REFERENCES rec_sprint_attachment(sprint_attachment_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rec_candidate_sprint_attachment (
  candidate_sprint_attachment_id INT NOT NULL AUTO_INCREMENT,
  candidate_sprint_id INT NOT NULL,
  sprint_attachment_id INT NOT NULL,
  source_sprint_template_attachment_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (candidate_sprint_attachment_id),
  KEY idx_rec_candidate_sprint_attachment_sprint (candidate_sprint_id),
  CONSTRAINT fk_rec_candidate_sprint_attachment_sprint
    FOREIGN KEY (candidate_sprint_id) REFERENCES rec_candidate_sprint(candidate_sprint_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_rec_candidate_sprint_attachment_attachment
    FOREIGN KEY (sprint_attachment_id) REFERENCES rec_sprint_attachment(sprint_attachment_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_rec_candidate_sprint_attachment_source
    FOREIGN KEY (source_sprint_template_attachment_id) REFERENCES rec_sprint_template_attachment(sprint_template_attachment_id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
