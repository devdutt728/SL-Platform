-- One-time seed: default designation openings requested by Devdutt Kumar (person_id: DK_513)
-- Keeps defaults aligned with create_opening:
-- description=NULL, city=Delhi, country=India, headcount_required=1, headcount_filled=0, is_active=1
-- Uses fixed opening codes for the seeded designation titles.
-- Idempotent by title (case-insensitive): re-running will not create duplicates.

INSERT INTO rec_opening (
  opening_code,
  title,
  description,
  location_city,
  location_country,
  reporting_person_id_platform,
  headcount_required,
  headcount_filled,
  is_active,
  created_at,
  updated_at
)
SELECT
  'GRPL-829955',
  'Group Leader',
  NULL,
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) = LOWER('Group Leader')
);

INSERT INTO rec_opening (
  opening_code, title, description, location_city, location_country, reporting_person_id_platform,
  headcount_required, headcount_filled, is_active, created_at, updated_at
)
SELECT
  'ASSO-82996A',
  'Associate',
  NULL,
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) = LOWER('Associate')
);

INSERT INTO rec_opening (
  opening_code, title, description, location_city, location_country, reporting_person_id_platform,
  headcount_required, headcount_filled, is_active, created_at, updated_at
)
SELECT
  'PRDS-82997A',
  'Project Designer',
  NULL,
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) = LOWER('Project Designer')
);

INSERT INTO rec_opening (
  opening_code, title, description, location_city, location_country, reporting_person_id_platform,
  headcount_required, headcount_filled, is_active, created_at, updated_at
)
SELECT
  'SRAR-829986',
  'Sr. Architect',
  NULL,
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) = LOWER('Sr. Architect')
);

INSERT INTO rec_opening (
  opening_code, title, description, location_city, location_country, reporting_person_id_platform,
  headcount_required, headcount_filled, is_active, created_at, updated_at
)
SELECT
  'SRDS-829990',
  'Sr. Designer',
  NULL,
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) = LOWER('Sr. Designer')
);

INSERT INTO rec_opening (
  opening_code, title, description, location_city, location_country, reporting_person_id_platform,
  headcount_required, headcount_filled, is_active, created_at, updated_at
)
SELECT
  'ARCH-82999A',
  'Architect',
  NULL,
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) = LOWER('Architect')
);

INSERT INTO rec_opening (
  opening_code, title, description, location_city, location_country, reporting_person_id_platform,
  headcount_required, headcount_filled, is_active, created_at, updated_at
)
SELECT
  'INDS-8299A4',
  'Interior Designer',
  NULL,
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) = LOWER('Interior Designer')
);

INSERT INTO rec_opening (
  opening_code, title, description, location_city, location_country, reporting_person_id_platform,
  headcount_required, headcount_filled, is_active, created_at, updated_at
)
SELECT
  'CMIN-8299B0',
  'Communications Intern',
  NULL,
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) = LOWER('Communications Intern')
);

INSERT INTO rec_opening (
  opening_code, title, description, location_city, location_country, reporting_person_id_platform,
  headcount_required, headcount_filled, is_active, created_at, updated_at
)
SELECT
  'INTR-8299B8',
  'Intern',
  NULL,
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) = LOWER('Intern')
);

INSERT INTO rec_opening (
  opening_code, title, description, location_city, location_country, reporting_person_id_platform,
  headcount_required, headcount_filled, is_active, created_at, updated_at
)
SELECT
  'OTHR-8299BF',
  'Others',
  NULL,
  'Delhi',
  'India',
  'DK_513',
  1,
  0,
  1,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
WHERE NOT EXISTS (
  SELECT 1 FROM rec_opening ro WHERE LOWER(TRIM(ro.title)) = LOWER('Others')
);
