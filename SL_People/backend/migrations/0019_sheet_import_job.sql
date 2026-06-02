-- Table 18 — sheet_import_job
-- Tracks every Excel/CSV import attempt and Google Sheet sync batch.

USE sl_people;

CREATE TABLE IF NOT EXISTS sheet_import_job (
  id             CHAR(36)     NOT NULL,
  source         VARCHAR(50)  NULL,  -- emp_master | org_data | licenses | systems
  filename       VARCHAR(255) NULL,
  total_rows     INT          NULL,
  success_rows   INT          NOT NULL DEFAULT 0,
  error_rows     INT          NOT NULL DEFAULT 0,
  column_mapping JSON         NULL,
  error_log      JSON         NULL,
  performed_by   VARCHAR(64)  NULL,
  performed_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending',
  PRIMARY KEY (id),
  KEY idx_sheet_import_job_time (performed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
