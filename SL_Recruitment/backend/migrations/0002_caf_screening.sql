-- Phase 3A: CAF token + screening table (MySQL)

ALTER TABLE rec_candidate
  ADD COLUMN caf_token VARCHAR(64) NULL UNIQUE,
  ADD COLUMN caf_sent_at DATETIME NULL,
  ADD COLUMN caf_submitted_at DATETIME NULL,
  ADD COLUMN needs_hr_review BOOLEAN NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS rec_candidate_screening (
  candidate_screening_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  candidate_id INT NOT NULL UNIQUE,

  total_experience_years DECIMAL(4,1) NULL,
  relevant_experience_years DECIMAL(4,1) NULL,
  current_ctc_annual DECIMAL(12,2) NULL,
  expected_ctc_annual DECIMAL(12,2) NULL,
  salary_band_fit VARCHAR(50) NULL,

  willing_to_relocate BOOLEAN NULL,
  notice_period_days INT NULL,
  expected_joining_date DATE NULL,

  relocation_notes TEXT NULL,
  questions_from_candidate TEXT NULL,

  screening_result VARCHAR(20) NULL,
  screening_notes TEXT NULL,

  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

-- Optional (only if rec_opening doesn't already have it):
-- ALTER TABLE rec_opening ADD COLUMN opening_code VARCHAR(50) NULL;
-- CREATE INDEX idx_rec_opening_code ON rec_opening(opening_code);
