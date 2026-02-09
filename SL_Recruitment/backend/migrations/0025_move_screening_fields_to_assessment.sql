ALTER TABLE rec_candidate_screening DROP COLUMN current_employer;
ALTER TABLE rec_candidate_screening DROP COLUMN relevant_experience_years;
ALTER TABLE rec_candidate_screening DROP COLUMN current_ctc_annual;
ALTER TABLE rec_candidate_screening DROP COLUMN expected_ctc_annual;
ALTER TABLE rec_candidate_screening DROP COLUMN notice_period_days;
ALTER TABLE rec_candidate_screening DROP COLUMN reason_for_job_change;

ALTER TABLE rec_candidate_assessment ADD COLUMN current_employer VARCHAR(255) NULL;
ALTER TABLE rec_candidate_assessment ADD COLUMN relevant_experience_years DECIMAL(4,1) NULL;
ALTER TABLE rec_candidate_assessment ADD COLUMN current_ctc_annual DECIMAL(12,2) NULL;
ALTER TABLE rec_candidate_assessment ADD COLUMN expected_ctc_annual DECIMAL(12,2) NULL;
ALTER TABLE rec_candidate_assessment ADD COLUMN notice_period_days INT NULL;
ALTER TABLE rec_candidate_assessment ADD COLUMN reason_for_job_change TEXT NULL;
