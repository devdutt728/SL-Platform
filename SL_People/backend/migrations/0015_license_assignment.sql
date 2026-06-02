-- Table 14 — license_assignment
-- Who holds what software license. From the Licenses sheet.

USE sl_people;

CREATE TABLE IF NOT EXISTS license_assignment (
  id              CHAR(36)     NOT NULL,
  work_email      VARCHAR(255) NOT NULL,
  tool_name       VARCHAR(255) NOT NULL,
  tool_short_name VARCHAR(100) NULL,
  plan            VARCHAR(255) NULL,
  status          VARCHAR(50)  NOT NULL DEFAULT 'Assigned',  -- Assigned | Revoked
  assigned_on     DATE         NULL,
  renewal_date    DATE         NULL,
  cost_centre     VARCHAR(100) NULL,
  notes           TEXT         NULL,
  smart_key       VARCHAR(255) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_license_assignment_email (work_email),
  KEY idx_license_assignment_tool (tool_short_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
