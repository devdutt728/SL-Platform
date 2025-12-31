-- Add candidate offers + final decision fields (MySQL)

ALTER TABLE rec_candidate
  ADD COLUMN IF NOT EXISTS final_decision VARCHAR(32) NOT NULL DEFAULT 'pending'
    COMMENT 'pending | hired | not_hired' AFTER status,
  ADD COLUMN IF NOT EXISTS hired_person_id_platform INT NULL
    COMMENT 'FK hook to sl_platform.dim_person.person_id (no FK constraint)' AFTER final_decision;

DROP INDEX IF EXISTS idx_rec_candidate_final_decision ON rec_candidate;
CREATE INDEX idx_rec_candidate_final_decision
  ON rec_candidate (final_decision);

DROP INDEX IF EXISTS idx_rec_candidate_hired_person ON rec_candidate;
CREATE INDEX idx_rec_candidate_hired_person
  ON rec_candidate (hired_person_id_platform);

CREATE TABLE IF NOT EXISTS rec_candidate_offer (
  candidate_offer_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  candidate_id INT UNSIGNED NOT NULL,
  opening_id INT UNSIGNED NULL,
  offer_template_code VARCHAR(64) NOT NULL,
  offer_version INT NOT NULL DEFAULT 1,
  gross_ctc_annual DECIMAL(14,2) NULL,
  fixed_ctc_annual DECIMAL(14,2) NULL,
  variable_ctc_annual DECIMAL(14,2) NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  designation_title VARCHAR(191) NOT NULL,
  grade_id_platform INT NULL
    COMMENT 'FK hook to sl_platform.dim_grade.grade_id (no FK constraint)',
  joining_date DATE NULL,
  probation_months INT NULL,
  offer_valid_until DATE NULL,
  offer_status ENUM(
      'draft',
      'pending_approval',
      'approved',
      'sent',
      'viewed',
      'accepted',
      'declined',
      'withdrawn'
    ) NOT NULL DEFAULT 'draft',
  public_token CHAR(64) NOT NULL
    COMMENT 'Public token used for /offer/{token} URL',
  generated_by_person_id_platform INT NULL
    COMMENT 'Who drafted this (sl_platform.dim_person.person_id)',
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by_person_id_platform INT NULL
    COMMENT 'Approver (Harsh etc, sl_platform.dim_person.person_id)',
  approved_at DATETIME NULL,
  sent_at DATETIME NULL,
  viewed_at DATETIME NULL,
  accepted_at DATETIME NULL,
  declined_at DATETIME NULL,
  pdf_url VARCHAR(512) NULL
    COMMENT 'Drive URL to generated offer letter PDF',
  notes_internal TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (candidate_offer_id),
  CONSTRAINT fk_rec_candidate_offer_candidate
    FOREIGN KEY (candidate_id)
    REFERENCES rec_candidate(candidate_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_rec_candidate_offer_opening
    FOREIGN KEY (opening_id)
    REFERENCES rec_opening(opening_id)
    ON DELETE SET NULL,
  UNIQUE KEY uk_rec_candidate_offer_public_token (public_token),
  KEY idx_rec_candidate_offer_candidate_id (candidate_id),
  KEY idx_rec_candidate_offer_opening_id (opening_id),
  KEY idx_rec_candidate_offer_status (offer_status),
  KEY idx_rec_candidate_offer_accepted_at (accepted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
