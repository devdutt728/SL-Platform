-- Idempotency + basic rate limiting support for public apply endpoint.

CREATE TABLE IF NOT EXISTS rec_apply_idempotency (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  opening_code VARCHAR(100) NOT NULL,
  email_normalized VARCHAR(255) NOT NULL,
  ip_address VARCHAR(64) NULL,
  status_code INT NULL,
  response_json MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rec_apply_idempotency_key (idempotency_key),
  KEY ix_rec_apply_idempotency_email_created (email_normalized, created_at),
  KEY ix_rec_apply_idempotency_ip_created (ip_address, created_at),
  KEY ix_rec_apply_idempotency_opening_created (opening_code, created_at)
);

