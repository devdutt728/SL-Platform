-- Enforce DB-level uniqueness for governed person codes after backfill.
-- MySQL 8.0.4 compatible.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS enforce_dim_person_code_unique_keys;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE PROCEDURE enforce_dim_person_code_unique_keys()
BEGIN
  DECLARE v_person_code_duplicates INT DEFAULT 0;
  DECLARE v_reserved_code_duplicates INT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR 1061 BEGIN END;

  SELECT COUNT(*)
  INTO v_person_code_duplicates
  FROM (
    SELECT `person_code`
    FROM `dim_person`
    WHERE `person_code` IS NOT NULL
      AND TRIM(`person_code`) <> ''
    GROUP BY `person_code`
    HAVING COUNT(*) > 1
  ) dup_person_code;

  IF v_person_code_duplicates > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Duplicate person_code values still exist in dim_person. Resolve before enforcing unique key.';
  END IF;

  SELECT COUNT(*)
  INTO v_reserved_code_duplicates
  FROM (
    SELECT `reserved_person_code`
    FROM `dim_person`
    WHERE `reserved_person_code` IS NOT NULL
      AND TRIM(`reserved_person_code`) <> ''
    GROUP BY `reserved_person_code`
    HAVING COUNT(*) > 1
  ) dup_reserved_code;

  IF v_reserved_code_duplicates > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Duplicate reserved_person_code values still exist in dim_person. Resolve before enforcing unique key.';
  END IF;

  ALTER TABLE `dim_person`
    ADD UNIQUE KEY `uq_dim_person_person_code` (`person_code`);

  ALTER TABLE `dim_person`
    ADD UNIQUE KEY `uq_dim_person_reserved_person_code` (`reserved_person_code`);
END$$
DELIMITER ;

CALL enforce_dim_person_code_unique_keys();

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS enforce_dim_person_code_unique_keys;
SET sql_notes = IFNULL(@prev_sql_notes, 1);
