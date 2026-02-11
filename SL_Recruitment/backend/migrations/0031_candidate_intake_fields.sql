/* 1) Add missing columns (only if they don't already exist) */
SET @clauses := NULL;

/* first_name */
SELECT IF(COUNT(*)=0,
          'ADD COLUMN first_name VARCHAR(100) NULL AFTER candidate_code',
          NULL)
INTO @c
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name   = 'rec_candidate'
  AND column_name  = 'first_name';
SET @clauses := CONCAT_WS(', ', @clauses, @c);

/* last_name */
SELECT IF(COUNT(*)=0,
          'ADD COLUMN last_name VARCHAR(100) NULL AFTER first_name',
          NULL)
INTO @c
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name   = 'rec_candidate'
  AND column_name  = 'last_name';
SET @clauses := CONCAT_WS(', ', @clauses, @c);

/* resume_url */
SELECT IF(COUNT(*)=0,
          'ADD COLUMN resume_url VARCHAR(500) NULL AFTER cv_url',
          NULL)
INTO @c
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name   = 'rec_candidate'
  AND column_name  = 'resume_url';
SET @clauses := CONCAT_WS(', ', @clauses, @c);

/* educational_qualification */
SELECT IF(COUNT(*)=0,
          'ADD COLUMN educational_qualification VARCHAR(255) NULL AFTER current_company',
          NULL)
INTO @c
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name   = 'rec_candidate'
  AND column_name  = 'educational_qualification';
SET @clauses := CONCAT_WS(', ', @clauses, @c);

/* years_of_experience */
SELECT IF(COUNT(*)=0,
          'ADD COLUMN years_of_experience DECIMAL(4,1) NULL AFTER educational_qualification',
          NULL)
INTO @c
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name   = 'rec_candidate'
  AND column_name  = 'years_of_experience';
SET @clauses := CONCAT_WS(', ', @clauses, @c);

/* city */
SELECT IF(COUNT(*)=0,
          'ADD COLUMN city VARCHAR(100) NULL AFTER years_of_experience',
          NULL)
INTO @c
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name   = 'rec_candidate'
  AND column_name  = 'city';
SET @clauses := CONCAT_WS(', ', @clauses, @c);

/* terms_consent */
SELECT IF(COUNT(*)=0,
          'ADD COLUMN terms_consent BOOLEAN NOT NULL DEFAULT 0 AFTER city',
          NULL)
INTO @c
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name   = 'rec_candidate'
  AND column_name  = 'terms_consent';
SET @clauses := CONCAT_WS(', ', @clauses, @c);

/* terms_consent_at */
SELECT IF(COUNT(*)=0,
          'ADD COLUMN terms_consent_at DATETIME NULL AFTER terms_consent',
          NULL)
INTO @c
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name   = 'rec_candidate'
  AND column_name  = 'terms_consent_at';
SET @clauses := CONCAT_WS(', ', @clauses, @c);

/* Run ALTER only if we have something to add */
SET @ddl := IF(@clauses IS NULL OR @clauses = '',
               'SELECT 1',
               CONCAT('ALTER TABLE rec_candidate ', @clauses));

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

/* 2) Populate first_name / last_name where missing */
UPDATE rec_candidate
SET
  first_name = CASE
    WHEN first_name IS NOT NULL AND TRIM(first_name) <> '' THEN TRIM(first_name)
    WHEN full_name IS NOT NULL AND TRIM(full_name) <> '' THEN SUBSTRING_INDEX(TRIM(full_name), ' ', 1)
    ELSE first_name
  END,
  last_name = CASE
    WHEN last_name IS NOT NULL AND TRIM(last_name) <> '' THEN TRIM(last_name)
    WHEN full_name IS NOT NULL AND LOCATE(' ', TRIM(full_name)) > 0
      THEN TRIM(SUBSTRING(TRIM(full_name), LOCATE(' ', TRIM(full_name)) + 1))
    ELSE last_name
  END
WHERE
  (first_name IS NULL OR TRIM(first_name) = '')
  OR (last_name IS NULL OR TRIM(last_name) = '');