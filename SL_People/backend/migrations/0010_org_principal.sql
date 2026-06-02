-- Table 9 — org_principal
-- The 4 fixed principals. Seeded once from Code.gs ORG_CONFIG. Never edited via UI.

USE sl_people;

CREATE TABLE IF NOT EXISTS org_principal (
  id          CHAR(36)     NOT NULL,
  name        VARCHAR(100) NOT NULL,
  color       VARCHAR(7)   NOT NULL,
  employee_no VARCHAR(20)  NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_principal_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
