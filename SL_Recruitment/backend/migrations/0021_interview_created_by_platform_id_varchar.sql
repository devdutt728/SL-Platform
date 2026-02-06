-- Fix schema mismatch: platform person IDs can be strings like DK_513.
-- Ensure created_by_person_id_platform columns can store those values.

ALTER TABLE rec_candidate_interview
  MODIFY created_by_person_id_platform VARCHAR(64) NULL;

ALTER TABLE rec_candidate_interview_slot
  MODIFY created_by_person_id_platform VARCHAR(64) NULL;

