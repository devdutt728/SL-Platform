-- Add candidate profile + DEI fields to rec_candidate_screening (MySQL)
-- Fields are collected via CAF/apply forms.

ALTER TABLE rec_candidate_screening
  ADD COLUMN IF NOT EXISTS current_city VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS current_employer VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS gender_identity VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS gender_self_describe VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS reason_for_job_change TEXT NULL;

