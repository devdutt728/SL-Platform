-- Table 8 — employee_audit_log
-- Immutable. Every field change is a new row. Insert-only, never updated.

USE sl_people;

CREATE TABLE IF NOT EXISTS employee_audit_log (
  id                     CHAR(36)     NOT NULL,
  employee_id            CHAR(36)     NOT NULL,
  performed_by_person_id VARCHAR(64)  NOT NULL,
  performed_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  section                VARCHAR(50)  NOT NULL,  -- profile|work_info|address|compliance|exit|policy|status
  field_name             VARCHAR(100) NOT NULL,
  old_value              TEXT         NULL,
  new_value              TEXT         NULL,
  ip_address             VARCHAR(45)  NULL,
  PRIMARY KEY (id),
  KEY idx_audit_employee_time (employee_id, performed_at),
  KEY idx_audit_actor_time (performed_by_person_id, performed_at),
  CONSTRAINT fk_audit_log_ext FOREIGN KEY (employee_id)
    REFERENCES employee_ext (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
