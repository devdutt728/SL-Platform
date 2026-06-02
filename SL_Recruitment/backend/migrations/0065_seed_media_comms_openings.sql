-- Seed Media & Comms openings used by the external website sheet.
-- Keeps Job ID generation aligned across Apps Script, backend opening creation,
-- and Google Sheet ingest.

SET time_zone = '+00:00';
SET @now_utc := UTC_TIMESTAMP();

START TRANSACTION;

UPDATE rec_opening ro
SET
  ro.opening_code = 'GRDS-8299C7',
  ro.jd_file_name = 'SL Graphic Designer.pdf',
  ro.updated_at = @now_utc
WHERE LOWER(TRIM(ro.title)) = LOWER('Graphic Designer')
  AND (ro.opening_code <> 'GRDS-8299C7' OR COALESCE(ro.jd_file_name, '') <> 'SL Graphic Designer.pdf')
  AND NOT EXISTS (
    SELECT 1
    FROM (SELECT opening_id FROM rec_opening WHERE opening_code = 'GRDS-8299C7') existing
    WHERE existing.opening_id <> ro.opening_id
  );

INSERT INTO rec_opening (
  opening_code, title, description, jd_file_name, location_city, location_country, reporting_person_id_platform,
  headcount_required, headcount_filled, is_active, created_at, updated_at
)
SELECT
  'GRDS-8299C7',
  'Graphic Designer',
  NULL,
  'SL Graphic Designer.pdf',
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  @now_utc,
  @now_utc
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) = LOWER('Graphic Designer')
);

UPDATE rec_opening ro
SET
  ro.opening_code = 'CMDS-8299CF',
  ro.jd_file_name = 'SL Communications Designer.pdf',
  ro.updated_at = @now_utc
WHERE LOWER(TRIM(ro.title)) IN (LOWER('Comms Designer'), LOWER('Communications Designer'))
  AND (ro.opening_code <> 'CMDS-8299CF' OR COALESCE(ro.jd_file_name, '') <> 'SL Communications Designer.pdf')
  AND NOT EXISTS (
    SELECT 1
    FROM (SELECT opening_id FROM rec_opening WHERE opening_code = 'CMDS-8299CF') existing
    WHERE existing.opening_id <> ro.opening_id
  );

INSERT INTO rec_opening (
  opening_code, title, description, jd_file_name, location_city, location_country, reporting_person_id_platform,
  headcount_required, headcount_filled, is_active, created_at, updated_at
)
SELECT
  'CMDS-8299CF',
  'Comms Designer',
  NULL,
  'SL Communications Designer.pdf',
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  @now_utc,
  @now_utc
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) IN (LOWER('Comms Designer'), LOWER('Communications Designer'))
);

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
  'Standard opening creation baseline for Media & Comms website roles.',
  ro.reporting_person_id_platform,
  'standard_opening_creation',
  'migration_0065_seed',
  'applied',
  'SYSTEM',
  @now_utc,
  @now_utc,
  COALESCE(ro.created_at, @now_utc),
  @now_utc
FROM rec_opening ro
WHERE ro.opening_code IN ('GRDS-8299C7', 'CMDS-8299CF')
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
  '{"note":"Seeded as standard opening creation for Media & Comms website roles.","migration":"0065"}',
  @now_utc
FROM rec_opening_request ror
WHERE ror.source_portal = 'migration_0065_seed'
  AND ror.request_type = 'create_opening'
  AND NOT EXISTS (
    SELECT 1
    FROM rec_opening_event roe
    WHERE roe.opening_request_id = ror.opening_request_id
      AND roe.action_type = 'opening_creation_standard_seed'
  );

COMMIT;
