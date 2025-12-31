-- Sprint templates and candidate sprint assignments

CREATE TABLE IF NOT EXISTS rec_sprint_template (
  sprint_template_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  opening_id INT UNSIGNED NULL,
  role_id_platform INT UNSIGNED NULL,
  instructions_url VARCHAR(500) NULL,
  expected_duration_days INT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (sprint_template_id),
  KEY ix_rec_sprint_template_opening (opening_id),
  KEY ix_rec_sprint_template_role (role_id_platform),
  KEY ix_rec_sprint_template_active (is_active),
  CONSTRAINT fk_rec_sprint_template_opening
    FOREIGN KEY (opening_id) REFERENCES rec_opening(opening_id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rec_candidate_sprint (
  candidate_sprint_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  candidate_id INT UNSIGNED NOT NULL,
  sprint_template_id INT UNSIGNED NOT NULL,
  assigned_by_person_id_platform VARCHAR(64) NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at DATETIME NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'assigned',
  submission_url VARCHAR(500) NULL,
  submitted_at DATETIME NULL,
  reviewed_by_person_id_platform VARCHAR(64) NULL,
  reviewed_at DATETIME NULL,
  score_overall DECIMAL(4, 2) NULL,
  comments_internal TEXT NULL,
  comments_for_candidate TEXT NULL,
  decision VARCHAR(20) NULL,
  public_token VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (candidate_sprint_id),
  UNIQUE KEY uq_rec_candidate_sprint_public_token (public_token),
  KEY ix_rec_candidate_sprint_candidate (candidate_id),
  KEY ix_rec_candidate_sprint_template (sprint_template_id),
  KEY ix_rec_candidate_sprint_status (status),
  KEY ix_rec_candidate_sprint_due (due_at),
  CONSTRAINT fk_rec_candidate_sprint_candidate
    FOREIGN KEY (candidate_id) REFERENCES rec_candidate(candidate_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_rec_candidate_sprint_template
    FOREIGN KEY (sprint_template_id) REFERENCES rec_sprint_template(sprint_template_id)
    ON DELETE RESTRICT
);
