-- Table 12 — org_draft
-- Up to 3 named draft slots. Stores the proposed set of group-key changes as a
-- diff plus a full snapshot for preview/revert. base_log_id references
-- org_change_log(id) logically (no hard FK to keep migration ordering simple).

USE sl_people;

CREATE TABLE IF NOT EXISTS org_draft (
  id            CHAR(36)     NOT NULL,
  slot_number   SMALLINT     NOT NULL,
  draft_name    VARCHAR(100) NOT NULL,
  moves_json    JSON         NOT NULL,
  full_snapshot JSON         NOT NULL,
  base_log_id   CHAR(36)     NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active | archived
  created_by    VARCHAR(64)  NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by    VARCHAR(64)  NULL,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_draft_slot (slot_number),
  CONSTRAINT chk_org_draft_slot CHECK (slot_number BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
