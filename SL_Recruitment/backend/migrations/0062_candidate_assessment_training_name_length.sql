-- Expand training / certification title storage for long course names

ALTER TABLE rec_candidate_assessment
  MODIFY COLUMN training1_name VARCHAR(255) NULL,
  MODIFY COLUMN training2_name VARCHAR(255) NULL;
