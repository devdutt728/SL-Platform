-- Table 3 — employee_address
-- Current and permanent addresses. Up to two rows per employee.

USE sl_people;

CREATE TABLE IF NOT EXISTS employee_address (
  id           CHAR(36)     NOT NULL,
  employee_id  CHAR(36)     NOT NULL,
  address_type VARCHAR(20)  NOT NULL,  -- 'current' | 'permanent'
  line1        VARCHAR(255) NULL,
  line2        VARCHAR(255) NULL,
  city         VARCHAR(100) NULL,
  state        VARCHAR(100) NULL,
  zip          VARCHAR(20)  NULL,
  country      VARCHAR(100) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_address_type (employee_id, address_type),
  CONSTRAINT fk_employee_address_ext FOREIGN KEY (employee_id)
    REFERENCES employee_ext (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
