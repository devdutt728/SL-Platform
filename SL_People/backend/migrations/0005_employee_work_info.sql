-- Table 4 — employee_work_info
-- Org positioning, reporting structure, job details.

USE sl_people;

CREATE TABLE IF NOT EXISTS employee_work_info (
  employee_id             CHAR(36)     NOT NULL,
  location                VARCHAR(255) NULL,
  location_country        VARCHAR(100) NULL,
  legal_entity            VARCHAR(255) NULL,
  business_unit           VARCHAR(100) NULL,
  department              VARCHAR(100) NULL,
  sub_department          VARCHAR(100) NULL,
  job_title               VARCHAR(255) NULL,
  secondary_job_title     VARCHAR(255) NULL,
  reporting_manager_id    CHAR(36)     NULL,
  dotted_line_manager_id  CHAR(36)     NULL,
  date_joined             DATE         NULL,
  exit_date               DATE         NULL,
  notice_period           VARCHAR(100) NULL,
  band                    VARCHAR(50)  NULL,
  pay_grade               VARCHAR(50)  NULL,
  cost_center             VARCHAR(100) NULL,
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (employee_id),
  KEY idx_work_info_department (department),
  KEY idx_work_info_business_unit (business_unit),
  KEY idx_work_info_manager (reporting_manager_id),
  CONSTRAINT fk_work_info_ext FOREIGN KEY (employee_id)
    REFERENCES employee_ext (id) ON DELETE CASCADE,
  CONSTRAINT fk_work_info_manager FOREIGN KEY (reporting_manager_id)
    REFERENCES employee_ext (id) ON DELETE SET NULL,
  CONSTRAINT fk_work_info_dotted FOREIGN KEY (dotted_line_manager_id)
    REFERENCES employee_ext (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
