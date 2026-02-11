CREATE TABLE IF NOT EXISTS rec_operation_retry (
  operation_retry_id INT AUTO_INCREMENT PRIMARY KEY,
  operation_type VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  candidate_id INT NULL,
  related_entity_type VARCHAR(64) NULL,
  related_entity_id INT NULL,
  payload_json TEXT NULL,
  idempotency_key VARCHAR(191) NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_retry_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rec_operation_retry_idempotency_key (idempotency_key),
  KEY idx_rec_operation_retry_status_next (status, next_retry_at),
  KEY idx_rec_operation_retry_candidate (candidate_id),
  KEY idx_rec_operation_retry_type (operation_type)
);

