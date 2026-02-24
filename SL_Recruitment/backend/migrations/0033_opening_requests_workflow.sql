/* ------------------------------------------------------------------
   Opening request workflow:
   - GL/HR raise requests against an existing opening code (or propose a new opening).
   - GL requests require HR approval before becoming live.
   - If opening is already live, approved requests increase headcount_required.
   - Full actor trace is stored in request + event tables.
------------------------------------------------------------------- */

SET time_zone = '+00:00';
SET @now_utc := UTC_TIMESTAMP();

CREATE TABLE IF NOT EXISTS rec_opening_request (
  opening_request_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  opening_id INT UNSIGNED NULL,
  opening_code VARCHAR(100) NULL,
  opening_title VARCHAR(255) NULL,
  opening_description TEXT NULL,
  location_city VARCHAR(100) NULL,
  location_country VARCHAR(100) NULL,
  hiring_manager_person_id_platform VARCHAR(64) NULL,
  request_type VARCHAR(40) NOT NULL,
  headcount_delta INT NOT NULL DEFAULT 1,
  request_reason TEXT NULL,
  requested_by_person_id_platform VARCHAR(64) NULL,
  requested_by_role VARCHAR(64) NULL,
  source_portal VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_hr_approval',
  approved_by_person_id_platform VARCHAR(64) NULL,
  approved_at DATETIME NULL,
  rejected_reason TEXT NULL,
  applied_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (opening_request_id),
  KEY idx_rec_opening_request_opening_id (opening_id),
  KEY idx_rec_opening_request_opening_code (opening_code),
  KEY idx_rec_opening_request_status (status),
  KEY idx_rec_opening_request_requested_by (requested_by_person_id_platform),
  KEY idx_rec_opening_request_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rec_opening_event (
  opening_event_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  opening_id INT UNSIGNED NULL,
  opening_request_id INT UNSIGNED NULL,
  action_type VARCHAR(64) NOT NULL,
  actor_person_id_platform VARCHAR(64) NULL,
  actor_role VARCHAR(64) NULL,
  meta_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (opening_event_id),
  KEY idx_rec_opening_event_opening_id (opening_id),
  KEY idx_rec_opening_event_request_id (opening_request_id),
  KEY idx_rec_opening_event_action_type (action_type),
  KEY idx_rec_opening_event_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

START TRANSACTION;

-- Backfill seeded designations as "standard opening creation" (not ad-hoc headcount raise).
INSERT INTO rec_opening_request (
  opening_id,
  opening_code,
  opening_title,
  opening_description,
  location_city,
  location_country,
  hiring_manager_person_id_platform,
  request_type,
  headcount_delta,
  request_reason,
  requested_by_person_id_platform,
  requested_by_role,
  source_portal,
  status,
  approved_by_person_id_platform,
  approved_at,
  applied_at,
  created_at,
  updated_at
)
SELECT
  ro.opening_id,
  ro.opening_code,
  ro.title,
  ro.description,
  ro.location_city,
  ro.location_country,
  ro.reporting_person_id_platform,
  'create_opening',
  CASE
    WHEN COALESCE(ro.headcount_required, 0) <= 0 THEN 1
    ELSE ro.headcount_required
  END AS headcount_delta,
  'Standard opening creation baseline. Existing seeded openings are not ad-hoc headcount raises by Devdutt.',
  ro.reporting_person_id_platform,
  'standard_opening_creation',
  'migration_0032_seed',
  'applied',
  'SYSTEM',
  @now_utc,
  @now_utc,
  COALESCE(ro.created_at, @now_utc),
  @now_utc
FROM rec_opening ro
WHERE ro.opening_code IN (
  'GRPL-829955',
  'ASSO-82996A',
  'PRDS-82997A',
  'SRAR-829986',
  'SRDS-829990',
  'ARCH-82999A',
  'INDS-8299A4',
  'CMIN-8299B0',
  'INTR-8299B8',
  'OTHR-8299BF'
)
AND NOT EXISTS (
  SELECT 1
  FROM rec_opening_request ror
  WHERE ror.opening_id = ro.opening_id
    AND ror.request_type = 'create_opening'
);

INSERT INTO rec_opening_event (
  opening_id,
  opening_request_id,
  action_type,
  actor_person_id_platform,
  actor_role,
  meta_json,
  created_at
)
SELECT
  ror.opening_id,
  ror.opening_request_id,
  'opening_creation_standard_seed',
  'SYSTEM',
  'migration',
  '{"note":"Seeded as standard opening creation; not an ad-hoc headcount raise by Devdutt.","migration":"0032+0033"}',
  @now_utc
FROM rec_opening_request ror
WHERE ror.source_portal = 'migration_0032_seed'
  AND ror.request_type = 'create_opening'
  AND NOT EXISTS (
    SELECT 1
    FROM rec_opening_event roe
    WHERE roe.opening_request_id = ror.opening_request_id
      AND roe.action_type = 'opening_creation_standard_seed'
  );

COMMIT;