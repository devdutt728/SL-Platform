-- Hard-guard against duplicate applications per opening.
-- Assumes MySQL 8+ (generated columns + functional indexes).

ALTER TABLE rec_candidate
  ADD COLUMN email_normalized VARCHAR(255)
  GENERATED ALWAYS AS (LOWER(email)) STORED;

CREATE UNIQUE INDEX uq_rec_candidate_opening_email_norm
  ON rec_candidate (applied_opening_id, email_normalized);

