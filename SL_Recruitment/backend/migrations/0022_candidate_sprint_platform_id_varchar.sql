ALTER TABLE rec_candidate_sprint
  MODIFY assigned_by_person_id_platform VARCHAR(64) NULL;

ALTER TABLE rec_candidate_sprint
  MODIFY reviewed_by_person_id_platform VARCHAR(64) NULL;
