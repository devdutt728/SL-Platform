-- Table 5 — employee_policy
-- HR-assigned policies: leave, shift, attendance, holidays.

USE sl_people;

CREATE TABLE IF NOT EXISTS employee_policy (
  employee_id                 CHAR(36)     NOT NULL,
  leave_plan                  VARCHAR(255) NULL,
  shift_policy                VARCHAR(255) NULL,
  weekly_off_policy           VARCHAR(255) NULL,
  attendance_tracking_policy  VARCHAR(255) NULL,
  attendance_capture_scheme   VARCHAR(255) NULL,
  holiday_list                VARCHAR(255) NULL,
  expense_policy              VARCHAR(255) NULL,
  updated_at                  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_employee_policy_ext FOREIGN KEY (employee_id)
    REFERENCES employee_ext (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
