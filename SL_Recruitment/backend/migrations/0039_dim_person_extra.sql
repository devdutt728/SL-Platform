-- MNC-style companion table for non-core employee master attributes.
-- Keeps dim_person stable while storing all extra Excel columns as JSON payloads.

CREATE TABLE IF NOT EXISTS dim_person_extra (
  person_id VARCHAR(64) NOT NULL,
  person_code VARCHAR(64) NULL,
  email VARCHAR(255) NULL,
  raw_payload_json LONGTEXT NULL,
  extra_payload_json LONGTEXT NULL,
  payload_hash CHAR(64) NULL,
  last_seen_batch_hash CHAR(64) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (person_id),
  KEY idx_dim_person_extra_code (person_code),
  KEY idx_dim_person_extra_email (email),
  KEY idx_dim_person_extra_batch (last_seen_batch_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
