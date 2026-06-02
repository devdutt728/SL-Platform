-- Table 6 — employee_compliance
-- Government IDs. All values are Fernet AES-256 encrypted at rest (the *_enc
-- columns store ciphertext, never plaintext). Admin-only access; every read is
-- recorded in employee_audit_log with action 'compliance_viewed'.

USE sl_people;

CREATE TABLE IF NOT EXISTS employee_compliance (
  employee_id          CHAR(36)    NOT NULL,
  pan_enc              TEXT        NULL,
  aadhaar_enc          TEXT        NULL,
  pf_number_enc        TEXT        NULL,
  uan_number_enc       TEXT        NULL,
  updated_at           DATETIME    NULL,
  updated_by_person_id VARCHAR(64) NULL,
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_employee_compliance_ext FOREIGN KEY (employee_id)
    REFERENCES employee_ext (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
