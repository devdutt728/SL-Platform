-- Ingest operations observability + Super Admin controls
-- Adds strict ingest state fields, structured errors, retry metadata, and resolution tracking.

ALTER TABLE rec_candidate_ingest_attempt
  ADD COLUMN ingest_state VARCHAR(32) NULL AFTER attempt_status,
  ADD COLUMN error_code VARCHAR(64) NULL AFTER ingest_state,
  ADD COLUMN resolution_hint VARCHAR(500) NULL AFTER error_code,
  ADD COLUMN retry_count INT NOT NULL DEFAULT 0 AFTER resolution_hint,
  ADD COLUMN first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER payload_json,
  ADD COLUMN last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER first_seen_at,
  ADD COLUMN next_retry_at DATETIME NULL AFTER last_attempt_at,
  ADD COLUMN resolved_at DATETIME NULL AFTER next_retry_at,
  ADD COLUMN resolved_by_person_id_platform INT NULL AFTER resolved_at,
  ADD COLUMN resolved_by_email VARCHAR(255) NULL AFTER resolved_by_person_id_platform,
  ADD COLUMN triggered_by_person_id_platform INT NULL AFTER resolved_by_email,
  ADD COLUMN triggered_by_email VARCHAR(255) NULL AFTER triggered_by_person_id_platform;

ALTER TABLE rec_candidate_ingest_attempt
  ADD KEY ix_rec_candidate_ingest_attempt_ingest_state (ingest_state),
  ADD KEY ix_rec_candidate_ingest_attempt_error_code (error_code),
  ADD KEY ix_rec_candidate_ingest_attempt_first_seen_at (first_seen_at),
  ADD KEY ix_rec_candidate_ingest_attempt_last_attempt_at (last_attempt_at),
  ADD KEY ix_rec_candidate_ingest_attempt_next_retry_at (next_retry_at),
  ADD KEY ix_rec_candidate_ingest_attempt_resolved_at (resolved_at);

UPDATE rec_candidate_ingest_attempt
SET
  ingest_state = CASE
    WHEN attempt_status IN ('created', 'reapplied') THEN 'created'
    WHEN attempt_status IN ('duplicate_idempotent', 'duplicate_recent', 'duplicate_integrity') THEN 'duplicate'
    WHEN attempt_status = 'retrying' THEN 'retrying'
    WHEN attempt_status = 'error' THEN 'failed_transient'
    ELSE NULL
  END,
  error_code = CASE
    WHEN attempt_status = 'error' THEN COALESCE(error_code, 'ingest_error')
    ELSE error_code
  END,
  resolution_hint = CASE
    WHEN attempt_status = 'error' THEN COALESCE(resolution_hint, 'Review row payload and retry. If issue persists, mark resolved with notes.')
    ELSE resolution_hint
  END,
  first_seen_at = COALESCE(first_seen_at, created_at, attempted_at, CURRENT_TIMESTAMP),
  last_attempt_at = COALESCE(last_attempt_at, attempted_at, created_at, CURRENT_TIMESTAMP);

ALTER TABLE rec_candidate_ingest_idempotency
  ADD COLUMN ingest_state VARCHAR(32) NULL AFTER result_status,
  ADD COLUMN error_code VARCHAR(64) NULL AFTER ingest_state,
  ADD COLUMN resolution_hint VARCHAR(500) NULL AFTER error_code,
  ADD COLUMN retry_count INT NOT NULL DEFAULT 0 AFTER resolution_hint,
  ADD COLUMN matching_key VARCHAR(32) NULL AFTER retry_count,
  ADD COLUMN last_error_at DATETIME NULL AFTER result_message,
  ADD COLUMN resolved_at DATETIME NULL AFTER last_error_at,
  ADD COLUMN resolved_by_email VARCHAR(255) NULL AFTER resolved_at;

ALTER TABLE rec_candidate_ingest_idempotency
  ADD KEY ix_rec_candidate_ingest_idempotency_ingest_state (ingest_state),
  ADD KEY ix_rec_candidate_ingest_idempotency_error_code (error_code);

UPDATE rec_candidate_ingest_idempotency
SET ingest_state = CASE
  WHEN result_status = 'created' THEN 'created'
  WHEN result_status = 'duplicate' THEN 'duplicate'
  WHEN result_status = 'retrying' THEN 'retrying'
  WHEN result_status LIKE 'failed_%' THEN result_status
  ELSE ingest_state
END
WHERE ingest_state IS NULL;
