-- SL IMS — Phase 0 core schema.
-- Inventory tables are added in later phases (P1+).
USE sl_ims;

CREATE TABLE IF NOT EXISTS ims_audit_log (
  audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_person_id VARCHAR(64) NULL,
  actor_email VARCHAR(255) NULL,
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ip VARCHAR(64) NULL,
  user_agent TEXT NULL,
  request_id VARCHAR(64) NULL,
  INDEX ix_ims_audit_entity (entity_type, entity_id),
  INDEX ix_ims_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
