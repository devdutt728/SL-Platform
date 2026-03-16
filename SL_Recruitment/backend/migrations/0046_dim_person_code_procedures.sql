-- Procedures for governed dim_person person-code allocation.
-- MySQL 8.0.4 compatible.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS sp_dim_person_counter_next_seq;
DROP PROCEDURE IF EXISTS sp_dim_person_generate_code;
DROP PROCEDURE IF EXISTS sp_dim_person_assign_code;
DROP PROCEDURE IF EXISTS sp_dim_person_sync_code_counters;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE PROCEDURE sp_dim_person_counter_next_seq(
  IN p_code_type VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  OUT p_seq INT
)
proc: BEGIN
  DECLARE v_code_type VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_next_seq INT DEFAULT NULL;
  DECLARE v_min_seq INT DEFAULT NULL;
  DECLARE v_max_seq INT DEFAULT NULL;

  SET v_code_type = UPPER(TRIM(COALESCE(p_code_type, '')));

  SELECT `next_seq`, `min_seq`, `max_seq`
  INTO v_next_seq, v_min_seq, v_max_seq
  FROM `dim_person_code_counter`
  WHERE `code_type` COLLATE utf8mb4_unicode_ci = v_code_type COLLATE utf8mb4_unicode_ci
  FOR UPDATE;

  IF v_next_seq IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'dim_person_code_counter row missing for requested code_type.';
  END IF;

  IF v_max_seq IS NOT NULL AND v_next_seq > v_max_seq THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No remaining person-code sequence for requested code_type.';
  END IF;

  SET p_seq = v_next_seq;

  UPDATE `dim_person_code_counter`
  SET `next_seq` = v_next_seq + 1,
      `updated_at` = NOW()
  WHERE `code_type` COLLATE utf8mb4_unicode_ci = v_code_type COLLATE utf8mb4_unicode_ci;
END$$

CREATE PROCEDURE sp_dim_person_generate_code(
  IN p_code_type VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  IN p_reserved_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  IN p_desired_root TINYINT,
  OUT p_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
)
proc: BEGIN
  DECLARE v_code_type VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_reserved_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_candidate VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_seq INT;
  DECLARE v_exists INT;
  DECLARE v_attempts INT DEFAULT 0;

  SET v_code_type = UPPER(TRIM(COALESCE(p_code_type, '')));
  SET v_reserved_person_code = NULLIF(UPPER(TRIM(COALESCE(p_reserved_person_code, ''))), '');
  SET p_person_code = NULL;

  IF p_desired_root IS NOT NULL AND (p_desired_root < 1 OR p_desired_root > 9) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'special_digit_root must be between 1 and 9.';
  END IF;

  IF v_reserved_person_code IS NOT NULL THEN
    IF fn_dim_person_code_is_valid(v_code_type, v_reserved_person_code) = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'reserved_person_code is invalid for the requested code_type.';
    END IF;

    IF p_desired_root IS NOT NULL AND fn_dim_person_digit_root(v_reserved_person_code) <> p_desired_root THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'reserved_person_code does not satisfy the requested digit root.';
    END IF;

    SELECT COUNT(*)
    INTO v_exists
    FROM `dim_person`
    WHERE UPPER(TRIM(COALESCE(`person_code`, ''))) COLLATE utf8mb4_unicode_ci
      = v_reserved_person_code COLLATE utf8mb4_unicode_ci;

    IF v_exists > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'reserved_person_code is already allocated.';
    END IF;

    SET p_person_code = v_reserved_person_code;
    LEAVE proc;
  END IF;

  generate_loop: LOOP
    SET v_attempts = v_attempts + 1;
    IF v_attempts > 50000 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unable to generate person_code within allowed attempts.';
    END IF;

    CALL sp_dim_person_counter_next_seq(v_code_type, v_seq);
    SET v_candidate = fn_dim_person_format_code(v_code_type, v_seq);

    IF v_candidate IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Generated person_code candidate is invalid.';
    END IF;

    IF p_desired_root IS NOT NULL AND fn_dim_person_digit_root(v_candidate) <> p_desired_root THEN
      ITERATE generate_loop;
    END IF;

    SELECT COUNT(*)
    INTO v_exists
    FROM `dim_person`
    WHERE UPPER(TRIM(COALESCE(`person_code`, ''))) COLLATE utf8mb4_unicode_ci
      = v_candidate COLLATE utf8mb4_unicode_ci;

    IF v_exists > 0 THEN
      ITERATE generate_loop;
    END IF;

    SET p_person_code = v_candidate;
    LEAVE generate_loop;
  END LOOP;
END$$

CREATE PROCEDURE sp_dim_person_assign_code(
  IN p_person_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  IN p_full_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  IN p_principal_flag TINYINT,
  IN p_employment_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  IN p_reserved_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  IN p_special_digit_root TINYINT,
  IN p_existing_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  OUT p_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
)
proc: BEGIN
  DECLARE v_code_type VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_existing_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_reserved_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

  SET v_code_type = fn_dim_person_code_type(p_principal_flag, p_employment_type);
  SET v_existing_person_code = NULLIF(UPPER(TRIM(COALESCE(p_existing_person_code, ''))), '');
  SET v_reserved_person_code = NULLIF(UPPER(TRIM(COALESCE(p_reserved_person_code, ''))), '');

  IF p_special_digit_root IS NOT NULL AND (p_special_digit_root < 1 OR p_special_digit_root > 9) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'special_digit_root must be between 1 and 9.';
  END IF;

  IF v_existing_person_code IS NOT NULL THEN
    IF fn_dim_person_code_is_valid(v_code_type, v_existing_person_code) = 1
       AND (v_reserved_person_code IS NULL OR v_existing_person_code = v_reserved_person_code)
       AND (p_special_digit_root IS NULL OR fn_dim_person_digit_root(v_existing_person_code) = p_special_digit_root) THEN
      SET p_person_code = v_existing_person_code;
      LEAVE proc;
    END IF;
  END IF;

  CALL sp_dim_person_generate_code(v_code_type, v_reserved_person_code, p_special_digit_root, p_person_code);
END$$

CREATE PROCEDURE sp_dim_person_sync_code_counters()
BEGIN
  UPDATE `dim_person_code_counter` c
  LEFT JOIN (
    SELECT 'PRINCIPAL' AS code_type, IFNULL(MAX(fn_dim_person_code_seq(`person_code`)), 0) AS max_seq
    FROM `dim_person`
    WHERE IFNULL(`principal_flag`, 0) = 1
      AND fn_dim_person_code_is_valid('PRINCIPAL', `person_code`) = 1
    UNION ALL
    SELECT 'EMPLOYEE' AS code_type, IFNULL(MAX(fn_dim_person_code_seq(`person_code`)), 10) AS max_seq
    FROM `dim_person`
    WHERE IFNULL(`principal_flag`, 0) = 0
      AND fn_dim_person_code_is_valid('EMPLOYEE', `person_code`) = 1
    UNION ALL
    SELECT 'INTERN' AS code_type, IFNULL(MAX(fn_dim_person_code_seq(`person_code`)), 0) AS max_seq
    FROM `dim_person`
    WHERE fn_dim_person_code_is_valid('INTERN', `person_code`) = 1
    UNION ALL
    SELECT 'CONTRACT' AS code_type, IFNULL(MAX(fn_dim_person_code_seq(`person_code`)), 0) AS max_seq
    FROM `dim_person`
    WHERE fn_dim_person_code_is_valid('CONTRACT', `person_code`) = 1
  ) x
    ON x.code_type = c.code_type
  SET c.next_seq = CASE
      WHEN c.code_type = 'PRINCIPAL' THEN LEAST(11, GREATEST(c.min_seq, IFNULL(x.max_seq, 0) + 1))
      ELSE GREATEST(c.min_seq, IFNULL(x.max_seq, 0) + 1)
    END,
    c.updated_at = NOW();
END$$
DELIMITER ;
