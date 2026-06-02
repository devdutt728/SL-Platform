-- Table 1 — employee_ext
-- HR extension of dim_person. One row per employee, ever.
-- Join key: employee_number = sl_platform.dim_person.person_code.

USE sl_people;

CREATE TABLE IF NOT EXISTS employee_ext (
  id                    CHAR(36)     NOT NULL,
  employee_number       VARCHAR(20)  NOT NULL,
  person_id             VARCHAR(64)  NULL,
  legacy_number         VARCHAR(20)  NULL,
  attendance_number     VARCHAR(20)  NULL,
  employment_status     VARCHAR(20)  NOT NULL DEFAULT 'working',
  worker_type           VARCHAR(20)  NOT NULL DEFAULT 'permanent',
  time_type             VARCHAR(20)  NOT NULL DEFAULT 'fulltime',
  is_deleted            TINYINT(1)   NOT NULL DEFAULT 0,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by_person_id  VARCHAR(64)  NULL,
  updated_by_person_id  VARCHAR(64)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_ext_number (employee_number),
  UNIQUE KEY uq_employee_ext_person (person_id),
  KEY idx_employee_ext_status (employment_status),
  KEY idx_employee_ext_person (person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
