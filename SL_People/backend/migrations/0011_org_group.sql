-- Table 10 — org_group
-- The teams/groups. Each belongs to a principal and has a team lead.

USE sl_people;

CREATE TABLE IF NOT EXISTS org_group (
  id             CHAR(36)     NOT NULL,
  group_key      VARCHAR(50)  NOT NULL,
  name           VARCHAR(100) NOT NULL,
  principal_name VARCHAR(100) NOT NULL,
  team_lead_emp  VARCHAR(20)  NULL,
  parent_name    VARCHAR(100) NULL,
  color_hex      VARCHAR(7)   NULL,
  sort_order     INT          NOT NULL DEFAULT 0,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_group_key (group_key),
  KEY idx_org_group_principal (principal_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
