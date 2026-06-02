-- Table 11 — org_employee
-- Live org chart assignment. One row per included employee. This is what the
-- org chart reads. designation_* and *_exp_years are computed (DESIGNATION_MAP /
-- computeExperience_ ported from Code.gs), never entered manually.

USE sl_people;

CREATE TABLE IF NOT EXISTS org_employee (
  id                   CHAR(36)     NOT NULL,
  employee_no          VARCHAR(20)  NOT NULL,
  group_key            VARCHAR(50)  NOT NULL,
  principal_name       VARCHAR(100) NOT NULL,
  org_level            VARCHAR(20)  NOT NULL,  -- Principal | Team Lead | Member | Excluded
  include_in_org       TINYINT(1)   NOT NULL DEFAULT 1,
  source_manager_emp   VARCHAR(20)  NULL,
  manager_override_emp VARCHAR(20)  NULL,
  designation_level    VARCHAR(50)  NULL,
  designation_color    VARCHAR(7)   NULL,
  designation_order    INT          NULL,
  prior_exp_years      DECIMAL(5,2) NULL,
  sl_exp_years         DECIMAL(5,2) NULL,
  o_exp_years          DECIMAL(5,2) NULL,
  image_url            TEXT         NULL,
  notes                TEXT         NULL,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by_person_id VARCHAR(64)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_employee_no (employee_no),
  KEY idx_org_employee_group (group_key),
  KEY idx_org_employee_principal (principal_name),
  KEY idx_org_employee_include (include_in_org),
  CONSTRAINT fk_org_employee_group FOREIGN KEY (group_key)
    REFERENCES org_group (group_key) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
