-- Candidate code allocator with reusable released slots.
-- Goals:
-- 1) decouple candidate_code from rec_candidate.candidate_id
-- 2) allow deleted candidate codes to be reused safely
-- 3) backfill existing live candidate codes and mark current gaps as released

CREATE TABLE IF NOT EXISTS rec_candidate_code_counter (
  counter_key VARCHAR(32) NOT NULL,
  next_sequence INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (counter_key)
);

CREATE TABLE IF NOT EXISTS rec_candidate_code_registry (
  candidate_code_registry_id INT NOT NULL AUTO_INCREMENT,
  sequence_no INT NOT NULL,
  candidate_code VARCHAR(32) NOT NULL,
  candidate_id INT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'released',
  reserved_at DATETIME NULL,
  assigned_at DATETIME NULL,
  released_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (candidate_code_registry_id),
  UNIQUE KEY uq_rec_candidate_code_registry_sequence (sequence_no),
  UNIQUE KEY uq_rec_candidate_code_registry_code (candidate_code),
  UNIQUE KEY uq_rec_candidate_code_registry_candidate (candidate_id),
  KEY ix_rec_candidate_code_registry_state_sequence (state, sequence_no)
);

INSERT IGNORE INTO rec_candidate_code_counter (counter_key, next_sequence)
VALUES ('default', 1);

INSERT IGNORE INTO rec_candidate_code_registry (
  sequence_no,
  candidate_code,
  candidate_id,
  state,
  reserved_at,
  assigned_at,
  released_at
)
SELECT
  CAST(SUBSTRING(rc.candidate_code, 5) AS UNSIGNED) AS sequence_no,
  UPPER(TRIM(rc.candidate_code)) AS candidate_code,
  rc.candidate_id,
  'assigned' AS state,
  NULL AS reserved_at,
  COALESCE(rc.created_at, CURRENT_TIMESTAMP) AS assigned_at,
  NULL AS released_at
FROM rec_candidate rc
WHERE rc.candidate_code REGEXP '^SLR-[0-9]{4,}$';

INSERT IGNORE INTO rec_candidate_code_registry (
  sequence_no,
  candidate_code,
  candidate_id,
  state,
  reserved_at,
  assigned_at,
  released_at
)
WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1
  FROM seq
  WHERE n < (
    SELECT COALESCE(MAX(CAST(SUBSTRING(candidate_code, 5) AS UNSIGNED)), 0)
    FROM rec_candidate
    WHERE candidate_code REGEXP '^SLR-[0-9]{4,}$'
  )
)
SELECT
  seq.n AS sequence_no,
  CONCAT('SLR-', LPAD(seq.n, 4, '0')) AS candidate_code,
  NULL AS candidate_id,
  'released' AS state,
  NULL AS reserved_at,
  NULL AS assigned_at,
  CURRENT_TIMESTAMP AS released_at
FROM seq
LEFT JOIN rec_candidate_code_registry r
  ON r.sequence_no = seq.n
WHERE r.candidate_code_registry_id IS NULL;

UPDATE rec_candidate_code_counter
SET
  next_sequence = (
    SELECT COALESCE(MAX(sequence_no), 0) + 1
    FROM rec_candidate_code_registry
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE counter_key = 'default';
