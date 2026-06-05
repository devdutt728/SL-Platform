-- Table 19 — people_access_grant
-- Fine-grained RBAC override. Keyed on sl_platform.dim_person.person_id.
-- When present, this overrides the role-derived default access level.

USE sl_people;

CREATE TABLE IF NOT EXISTS people_access_grant (
  person_id    VARCHAR(64) NOT NULL,
  access_level VARCHAR(20) NOT NULL,  -- view | edit | publisher | admin
  granted_by   VARCHAR(64) NULL,
  granted_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes        TEXT        NULL,
  PRIMARY KEY (person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
