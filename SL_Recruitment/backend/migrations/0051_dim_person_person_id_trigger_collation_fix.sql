-- Recreate legacy dim_person_bi trigger with explicit unicode collation handling.
-- This keeps person_id generation compatible with utf8mb4_unicode_ci tables on MySQL 8.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP TRIGGER IF EXISTS dim_person_bi;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE TRIGGER dim_person_bi
BEFORE INSERT ON `dim_person`
FOR EACH ROW
BEGIN
  DECLARE v_prefix VARCHAR(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_seq INT;

  IF NEW.`person_id` IS NULL
     OR COALESCE(TRIM(NEW.`person_id`), '') COLLATE utf8mb4_unicode_ci = '' COLLATE utf8mb4_unicode_ci THEN
    SET v_prefix = CONCAT(
      IFNULL(UPPER(LEFT(TRIM(NEW.`first_name`), 1)), 'X'),
      IFNULL(UPPER(LEFT(TRIM(NEW.`last_name`), 1)), 'X')
    );

    SELECT COALESCE(
             MAX(CAST(SUBSTRING_INDEX(`person_id`, '_', -1) AS UNSIGNED)), 0
           )
      INTO v_seq
      FROM `dim_person`
     WHERE `person_id` COLLATE utf8mb4_unicode_ci
           LIKE CONCAT(v_prefix COLLATE utf8mb4_unicode_ci, '_%') COLLATE utf8mb4_unicode_ci;

    SET NEW.`person_id` = CONCAT(v_prefix, '_', LPAD(v_seq + 1, 4, '0'));
  END IF;

  IF NEW.`role_id` IS NULL THEN
    SET NEW.`role_id` = 1;
  END IF;
END$$
DELIMITER ;
