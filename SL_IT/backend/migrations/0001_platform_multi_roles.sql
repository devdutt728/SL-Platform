-- Multi-role support for sl_platform
-- 1) Create junction table for person <-> role
-- 2) Backfill from dim_person.role_id

CREATE TABLE IF NOT EXISTS sl_platform.dim_person_role (
  person_id VARCHAR(64) NOT NULL,
  role_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_person_id VARCHAR(64) NULL,
  PRIMARY KEY (person_id, role_id),
  INDEX idx_dim_person_role_person (person_id),
  INDEX idx_dim_person_role_role (role_id)
);

INSERT INTO sl_platform.dim_person_role (person_id, role_id, created_at)
SELECT person_id, role_id, NOW()
FROM sl_platform.dim_person
WHERE role_id IS NOT NULL
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Optional: enforce unique role_code to avoid duplicates (run once).
-- If this fails, clean duplicate role_code rows before retrying.
ALTER TABLE sl_platform.dim_role
  ADD UNIQUE KEY uq_dim_role_code (role_code);
