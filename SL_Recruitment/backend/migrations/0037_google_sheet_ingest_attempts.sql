-- Google Sheet ingest idempotency + attempt history
-- Purpose:
-- 1) make per-row external references idempotent
-- 2) retain all ingest attempts for duplicate/reapply visibility

CREATE TABLE IF NOT EXISTS rec_candidate_ingest_idempotency (
  candidate_ingest_idempotency_id BIGINT NOT NULL AUTO_INCREMENT,
  source_origin VARCHAR(32) NOT NULL,
  external_source_ref VARCHAR(191) NOT NULL,
  candidate_id INT NULL,
  result_status VARCHAR(32) NOT NULL DEFAULT 'created',
  result_message VARCHAR(500) NULL,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (candidate_ingest_idempotency_id),
  UNIQUE KEY uq_rec_candidate_ingest_idempotency_origin_ref (source_origin, external_source_ref),
  KEY ix_rec_candidate_ingest_idempotency_candidate (candidate_id)
);

CREATE TABLE IF NOT EXISTS rec_candidate_ingest_attempt (
  candidate_ingest_attempt_id BIGINT NOT NULL AUTO_INCREMENT,
  source_origin VARCHAR(32) NOT NULL,
  sheet_id VARCHAR(191) NULL,
  sheet_name VARCHAR(191) NULL,
  batch_id VARCHAR(191) NULL,
  row_key VARCHAR(64) NULL,
  opening_id INT NULL,
  opening_code VARCHAR(100) NULL,
  email_normalized VARCHAR(255) NOT NULL,
  external_source_ref VARCHAR(191) NULL,
  attempt_status VARCHAR(32) NOT NULL,
  candidate_id INT NULL,
  message VARCHAR(500) NULL,
  payload_json TEXT NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (candidate_ingest_attempt_id),
  KEY ix_rec_candidate_ingest_attempt_candidate (candidate_id),
  KEY ix_rec_candidate_ingest_attempt_external_ref (external_source_ref),
  KEY ix_rec_candidate_ingest_attempt_opening_email (opening_id, email_normalized),
  KEY ix_rec_candidate_ingest_attempt_attempted_at (attempted_at)
);
