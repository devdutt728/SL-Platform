-- Allow alphanumeric platform person IDs in interview slot proposals.
ALTER TABLE rec_candidate_interview_slot
  MODIFY interviewer_person_id_platform VARCHAR(64) NULL;
