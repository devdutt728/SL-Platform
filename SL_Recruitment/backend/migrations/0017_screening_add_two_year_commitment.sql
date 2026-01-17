-- Add 2-year commitment field to rec_candidate_screening (MySQL)

ALTER TABLE rec_candidate_screening
  ADD COLUMN two_year_commitment BOOLEAN NULL;
