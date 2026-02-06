ALTER TABLE rec_candidate_sprint
  ADD COLUMN deleted_at DATETIME NULL AFTER submitted_at;
