-- Clean duplicate dim_person.personal_id values and enforce uniqueness.
-- personal_id maps to PAN from Emp Master / joining profile. It should be
-- blank when unknown, not copied across multiple people.

USE sl_platform;

UPDATE `dim_person`
SET `personal_id` = NULL
WHERE `personal_id` IS NOT NULL
  AND (
    TRIM(`personal_id`) = ''
    OR LOWER(REGEXP_REPLACE(TRIM(`personal_id`), '[^a-z0-9]+', '_')) IN (
      'na',
      'n_a',
      'none',
      'null',
      'not_available',
      'not_applicable'
    )
  );

UPDATE `dim_person`
SET `personal_id` = UPPER(REPLACE(TRIM(`personal_id`), ' ', ''))
WHERE `personal_id` IS NOT NULL;

UPDATE `dim_person` p
JOIN (
  SELECT `personal_id`
  FROM `dim_person`
  WHERE `personal_id` IS NOT NULL
  GROUP BY `personal_id`
  HAVING COUNT(*) > 1
) duplicates ON duplicates.`personal_id` = p.`personal_id`
SET p.`personal_id` = NULL;

DROP PROCEDURE IF EXISTS add_dim_person_personal_id_unique;

DELIMITER $$
CREATE PROCEDURE add_dim_person_personal_id_unique()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'dim_person'
      AND index_name = 'uq_dim_person_personal_id'
  ) THEN
    ALTER TABLE `dim_person`
      ADD UNIQUE KEY `uq_dim_person_personal_id` (`personal_id`);
  END IF;
END$$
DELIMITER ;

CALL add_dim_person_personal_id_unique();
DROP PROCEDURE IF EXISTS add_dim_person_personal_id_unique;
