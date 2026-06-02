-- Table 13 — org_change_log
-- Immutable. Every publish, revert, and the initial import creates a new row.
-- /ppl/org/live reads the latest row's snapshot_after (O(1)).

USE sl_people;

CREATE TABLE IF NOT EXISTS org_change_log (
  id                     CHAR(36)     NOT NULL,
  action                 VARCHAR(20)  NOT NULL,  -- publish | revert | initial_import
  performed_by_person_id VARCHAR(64)  NOT NULL,
  performed_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  draft_name             VARCHAR(100) NULL,
  snapshot_before        JSON         NULL,
  snapshot_after         JSON         NOT NULL,
  diff_summary           JSON         NULL,
  reverted_from_log_id   CHAR(36)     NULL,
  PRIMARY KEY (id),
  KEY idx_org_change_log_time (performed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
