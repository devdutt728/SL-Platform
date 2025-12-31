-- Align rec_candidate_screening with CAF submission fields expected by the app.
-- Adds current_ctc_annual and expected_ctc_annual if they are missing.

ALTER TABLE rec_candidate_screening
  ADD COLUMN IF NOT EXISTS current_ctc_annual DECIMAL(12,2) NULL,
  ADD COLUMN IF NOT EXISTS expected_ctc_annual DECIMAL(12,2) NULL;

