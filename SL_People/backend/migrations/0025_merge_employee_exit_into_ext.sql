-- Migration 0025 — merge employee_exit into employee_ext.
--
-- employee_ext is the one-row-per-employee HR anchor. Exit fields are a 1:1
-- optional section, so keeping them here avoids a second table for the same row.

USE sl_people;

ALTER TABLE employee_ext ADD COLUMN exit_status VARCHAR(100) NULL AFTER time_type;
ALTER TABLE employee_ext ADD COLUMN termination_type VARCHAR(100) NULL AFTER exit_status;
ALTER TABLE employee_ext ADD COLUMN termination_reason VARCHAR(100) NULL AFTER termination_type;
ALTER TABLE employee_ext ADD COLUMN resignation_note TEXT NULL AFTER termination_reason;
ALTER TABLE employee_ext ADD COLUMN exit_comments TEXT NULL AFTER resignation_note;

CREATE TABLE IF NOT EXISTS employee_exit (
  employee_id        CHAR(36)     NOT NULL,
  exit_status        VARCHAR(100) NULL,
  termination_type   VARCHAR(100) NULL,
  termination_reason VARCHAR(100) NULL,
  resignation_note   TEXT         NULL,
  comments           TEXT         NULL,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_employee_exit_ext FOREIGN KEY (employee_id)
    REFERENCES employee_ext (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE employee_ext ee
JOIN employee_exit ex ON ex.employee_id = ee.id
SET
  ee.exit_status = COALESCE(ee.exit_status, ex.exit_status),
  ee.termination_type = COALESCE(ee.termination_type, ex.termination_type),
  ee.termination_reason = COALESCE(ee.termination_reason, ex.termination_reason),
  ee.resignation_note = COALESCE(ee.resignation_note, ex.resignation_note),
  ee.exit_comments = COALESCE(ee.exit_comments, ex.comments);

DROP TABLE IF EXISTS employee_exit;
