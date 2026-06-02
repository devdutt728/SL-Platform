-- Table 7 — employee_exit
-- Exit and termination data. Populated only for relieved/terminated employees.

USE sl_people;

CREATE TABLE IF NOT EXISTS employee_exit (
  employee_id        CHAR(36)     NOT NULL,
  exit_status        VARCHAR(100) NULL,  -- Completed | In Progress
  termination_type   VARCHAR(100) NULL,
  termination_reason VARCHAR(100) NULL,
  resignation_note   TEXT         NULL,
  comments           TEXT         NULL,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_employee_exit_ext FOREIGN KEY (employee_id)
    REFERENCES employee_ext (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
