-- Apply only after the canonical basic-details and candidate-assessment-form rollout
-- has fully stabilized in production and rollback to legacy column names is no longer needed.

ALTER TABLE rec_candidate
  DROP INDEX ux_rec_candidate_caf_token,
  DROP COLUMN caf_token,
  DROP COLUMN caf_sent_at,
  DROP COLUMN caf_submitted_at;

ALTER TABLE rec_candidate_assessment
  DROP INDEX uq_rec_candidate_assessment_token,
  DROP COLUMN assessment_token,
  DROP COLUMN assessment_sent_at,
  DROP COLUMN assessment_submitted_at;
