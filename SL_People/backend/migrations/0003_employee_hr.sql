-- Table 2 — employee_hr
-- HR-specific personal fields not in dim_person (PII section).

USE sl_people;

CREATE TABLE IF NOT EXISTS employee_hr (
  employee_id            CHAR(36)     NOT NULL,
  middle_name            VARCHAR(100) NULL,
  personal_email         VARCHAR(255) NULL,
  work_phone             VARCHAR(30)  NULL,
  home_phone             VARCHAR(30)  NULL,
  date_of_birth          DATE         NULL,
  gender                 VARCHAR(20)  NULL,
  marital_status         VARCHAR(30)  NULL,
  marriage_date          DATE         NULL,
  blood_group            VARCHAR(20)  NULL,
  physically_handicapped TINYINT(1)   NOT NULL DEFAULT 0,
  nationality            VARCHAR(100) NULL,
  father_name            VARCHAR(255) NULL,
  mother_name            VARCHAR(255) NULL,
  spouse_name            VARCHAR(255) NULL,
  children_names         TEXT         NULL,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_employee_hr_ext FOREIGN KEY (employee_id)
    REFERENCES employee_ext (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
