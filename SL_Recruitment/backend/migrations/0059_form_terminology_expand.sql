ALTER TABLE rec_candidate
  ADD COLUMN basic_details_form_token VARCHAR(64) NULL AFTER caf_token,
  ADD COLUMN basic_details_form_sent_at DATETIME NULL AFTER caf_sent_at,
  ADD COLUMN basic_details_form_submitted_at DATETIME NULL AFTER caf_submitted_at;

UPDATE rec_candidate
SET
  basic_details_form_token = COALESCE(basic_details_form_token, caf_token),
  basic_details_form_sent_at = COALESCE(basic_details_form_sent_at, caf_sent_at),
  basic_details_form_submitted_at = COALESCE(basic_details_form_submitted_at, caf_submitted_at)
WHERE
  basic_details_form_token IS NULL
  OR basic_details_form_sent_at IS NULL
  OR basic_details_form_submitted_at IS NULL;

ALTER TABLE rec_candidate
  ADD UNIQUE KEY uq_rec_candidate_basic_details_form_token (basic_details_form_token);

ALTER TABLE rec_candidate_assessment
  ADD COLUMN candidate_assessment_form_token VARCHAR(64) NULL AFTER assessment_token,
  ADD COLUMN candidate_assessment_form_sent_at DATETIME NULL AFTER assessment_sent_at,
  ADD COLUMN candidate_assessment_form_submitted_at DATETIME NULL AFTER assessment_submitted_at;

UPDATE rec_candidate_assessment
SET
  candidate_assessment_form_token = COALESCE(candidate_assessment_form_token, assessment_token),
  candidate_assessment_form_sent_at = COALESCE(candidate_assessment_form_sent_at, assessment_sent_at),
  candidate_assessment_form_submitted_at = COALESCE(candidate_assessment_form_submitted_at, assessment_submitted_at)
WHERE
  candidate_assessment_form_token IS NULL
  OR candidate_assessment_form_sent_at IS NULL
  OR candidate_assessment_form_submitted_at IS NULL;

ALTER TABLE rec_candidate_assessment
  ADD UNIQUE KEY uq_rec_candidate_assessment_form_token (candidate_assessment_form_token);
