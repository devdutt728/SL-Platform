-- Link Media & Comms seeded openings to their JD PDFs.
-- Idempotent follow-up in case migration 0065 was applied before the JD assets existed.

SET time_zone = '+00:00';
SET @now_utc := UTC_TIMESTAMP();

START TRANSACTION;

UPDATE rec_opening
SET
  jd_file_name = 'SL Graphic Designer.pdf',
  updated_at = @now_utc
WHERE opening_code = 'GRDS-8299C7'
  AND LOWER(TRIM(title)) = LOWER('Graphic Designer')
  AND COALESCE(jd_file_name, '') <> 'SL Graphic Designer.pdf';

UPDATE rec_opening
SET
  jd_file_name = 'SL Communications Designer.pdf',
  updated_at = @now_utc
WHERE opening_code = 'CMDS-8299CF'
  AND LOWER(TRIM(title)) IN (LOWER('Comms Designer'), LOWER('Communications Designer'))
  AND COALESCE(jd_file_name, '') <> 'SL Communications Designer.pdf';

COMMIT;
