ALTER TABLE rec_candidate_screening DROP COLUMN questions_from_candidate;
ALTER TABLE rec_candidate ADD COLUMN questions_from_candidate TEXT NULL;
