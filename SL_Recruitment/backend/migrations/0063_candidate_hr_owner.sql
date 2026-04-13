ALTER TABLE rec_candidate
  ADD COLUMN hr_owner_email VARCHAR(255) NULL AFTER hired_person_id_platform,
  ADD COLUMN hr_owner_name VARCHAR(200) NULL AFTER hr_owner_email;

UPDATE rec_candidate
SET
  hr_owner_email = COALESCE(NULLIF(TRIM(hr_owner_email), ''), 'nishant.singh@studiolotus.in'),
  hr_owner_name = COALESCE(NULLIF(TRIM(hr_owner_name), ''), 'Nishant Singh')
WHERE
  hr_owner_email IS NULL
  OR TRIM(hr_owner_email) = ''
  OR hr_owner_name IS NULL
  OR TRIM(hr_owner_name) = '';
