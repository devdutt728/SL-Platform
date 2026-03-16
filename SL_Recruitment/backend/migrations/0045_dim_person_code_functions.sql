-- Helper functions for governed dim_person person-code allocation.
-- MySQL 8.0.4 compatible.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP FUNCTION IF EXISTS fn_dim_person_normalize_name;
DROP FUNCTION IF EXISTS fn_dim_person_normalize_employment_type;
DROP FUNCTION IF EXISTS fn_dim_person_digit_root;
DROP FUNCTION IF EXISTS fn_dim_person_format_seq;
DROP FUNCTION IF EXISTS fn_dim_person_code_type;
DROP FUNCTION IF EXISTS fn_dim_person_code_seq;
DROP FUNCTION IF EXISTS fn_dim_person_format_code;
DROP FUNCTION IF EXISTS fn_dim_person_code_is_valid;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE FUNCTION fn_dim_person_normalize_name(p_name VARCHAR(255))
RETURNS VARCHAR(255)
DETERMINISTIC
BEGIN
  DECLARE v_name VARCHAR(255);
  SET v_name = LOWER(TRIM(COALESCE(p_name, '')));
  SET v_name = REGEXP_REPLACE(v_name, '[^a-z0-9]+', ' ');
  SET v_name = REGEXP_REPLACE(v_name, '\\s+', ' ');
  RETURN TRIM(v_name);
END$$

CREATE FUNCTION fn_dim_person_normalize_employment_type(
  p_employment_type VARCHAR(64),
  p_job_title VARCHAR(255),
  p_email VARCHAR(255)
)
RETURNS VARCHAR(64)
DETERMINISTIC
BEGIN
  DECLARE v_employment_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_job_title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

  SET v_employment_type = LOWER(TRIM(COALESCE(p_employment_type, '')));
  SET v_job_title = LOWER(TRIM(COALESCE(p_job_title, '')));
  SET v_email = LOWER(TRIM(COALESCE(p_email, '')));

  IF v_employment_type LIKE '%contract%'
     OR v_employment_type LIKE '%consultant%'
     OR v_employment_type LIKE '%freelance%'
     OR v_employment_type LIKE '%retainer%'
     OR v_job_title LIKE '%contract%'
     OR v_job_title LIKE '%consultant%'
     OR v_job_title LIKE '%freelance%'
     OR v_job_title LIKE '%retainer%' THEN
    RETURN 'Contract';
  END IF;

  IF v_employment_type LIKE '%intern%'
     OR v_job_title LIKE '%intern%' THEN
    IF v_email = '' OR v_email NOT LIKE '%@studiolotus.in' THEN
      RETURN 'Intern';
    END IF;
    RETURN 'Intern';
  END IF;

  IF v_employment_type = '' THEN
    RETURN 'Permanent';
  END IF;

  IF v_employment_type LIKE '%permanent%'
     OR v_employment_type LIKE '%employee%' THEN
    RETURN 'Permanent';
  END IF;

  RETURN TRIM(COALESCE(p_employment_type, 'Permanent'));
END$$

CREATE FUNCTION fn_dim_person_digit_root(p_text VARCHAR(255))
RETURNS INT
DETERMINISTIC
BEGIN
  DECLARE v_digits VARCHAR(255);
  DECLARE v_sum INT;
  DECLARE v_pos INT;

  SET v_digits = REGEXP_REPLACE(COALESCE(p_text, ''), '[^0-9]', '');
  IF v_digits = '' THEN
    RETURN NULL;
  END IF;

  digit_loop: LOOP
    SET v_sum = 0;
    SET v_pos = 1;

    WHILE v_pos <= CHAR_LENGTH(v_digits) DO
      SET v_sum = v_sum + CAST(SUBSTRING(v_digits, v_pos, 1) AS UNSIGNED);
      SET v_pos = v_pos + 1;
    END WHILE;

    IF v_sum < 10 THEN
      LEAVE digit_loop;
    END IF;

    SET v_digits = CAST(v_sum AS CHAR);
  END LOOP;

  RETURN v_sum;
END$$

CREATE FUNCTION fn_dim_person_format_seq(p_seq INT)
RETURNS VARCHAR(16)
DETERMINISTIC
BEGIN
  IF p_seq IS NULL OR p_seq < 1 THEN
    RETURN NULL;
  END IF;

  RETURN LPAD(CAST(p_seq AS CHAR), GREATEST(3, CHAR_LENGTH(CAST(p_seq AS CHAR))), '0');
END$$

CREATE FUNCTION fn_dim_person_code_type(
  p_principal_flag TINYINT,
  p_employment_type VARCHAR(64)
)
RETURNS VARCHAR(16)
DETERMINISTIC
BEGIN
  DECLARE v_type VARCHAR(64);

  IF IFNULL(p_principal_flag, 0) = 1 THEN
    RETURN 'PRINCIPAL';
  END IF;

  SET v_type = LOWER(TRIM(COALESCE(p_employment_type, '')));

  IF v_type LIKE '%intern%' THEN
    RETURN 'INTERN';
  END IF;

  IF v_type LIKE '%contract%' OR v_type LIKE '%consultant%' OR v_type LIKE '%freelance%' OR v_type LIKE '%retainer%' THEN
    RETURN 'CONTRACT';
  END IF;

  RETURN 'EMPLOYEE';
END$$

CREATE FUNCTION fn_dim_person_code_seq(p_person_code VARCHAR(64))
RETURNS INT
DETERMINISTIC
BEGIN
  DECLARE v_digits VARCHAR(32);
  SET v_digits = REGEXP_REPLACE(UPPER(TRIM(COALESCE(p_person_code, ''))), '[^0-9]', '');
  IF v_digits = '' THEN
    RETURN NULL;
  END IF;
  RETURN CAST(v_digits AS UNSIGNED);
END$$

CREATE FUNCTION fn_dim_person_format_code(
  p_code_type VARCHAR(16),
  p_seq INT
)
RETURNS VARCHAR(64)
DETERMINISTIC
BEGIN
  DECLARE v_code_type VARCHAR(16);

  SET v_code_type = UPPER(TRIM(COALESCE(p_code_type, '')));
  IF p_seq IS NULL OR p_seq < 1 THEN
    RETURN NULL;
  END IF;

  IF v_code_type = 'PRINCIPAL' THEN
    IF p_seq > 10 THEN
      RETURN NULL;
    END IF;
    RETURN CONCAT('SL', fn_dim_person_format_seq(p_seq));
  END IF;

  IF v_code_type = 'EMPLOYEE' THEN
    IF p_seq < 11 THEN
      RETURN NULL;
    END IF;
    RETURN CONCAT('SL', fn_dim_person_format_seq(p_seq));
  END IF;

  IF v_code_type = 'INTERN' THEN
    RETURN CONCAT('SLI', fn_dim_person_format_seq(p_seq));
  END IF;

  IF v_code_type = 'CONTRACT' THEN
    RETURN CONCAT('SLC', fn_dim_person_format_seq(p_seq));
  END IF;

  RETURN NULL;
END$$

CREATE FUNCTION fn_dim_person_code_is_valid(
  p_code_type VARCHAR(16),
  p_person_code VARCHAR(64)
)
RETURNS TINYINT
DETERMINISTIC
BEGIN
  DECLARE v_code_type VARCHAR(16);
  DECLARE v_person_code VARCHAR(64);
  DECLARE v_seq INT;

  SET v_code_type = UPPER(TRIM(COALESCE(p_code_type, '')));
  SET v_person_code = UPPER(TRIM(COALESCE(p_person_code, '')));
  SET v_seq = fn_dim_person_code_seq(v_person_code);

  IF v_person_code = '' OR v_seq IS NULL THEN
    RETURN 0;
  END IF;

  IF v_code_type = 'PRINCIPAL' THEN
    RETURN IF(v_person_code REGEXP '^SL[0-9]{3,}$' AND v_seq BETWEEN 1 AND 10, 1, 0);
  END IF;

  IF v_code_type = 'EMPLOYEE' THEN
    RETURN IF(v_person_code REGEXP '^SL[0-9]{3,}$' AND v_seq >= 11, 1, 0);
  END IF;

  IF v_code_type = 'INTERN' THEN
    RETURN IF(v_person_code REGEXP '^SLI[0-9]{3,}$' AND v_seq >= 1, 1, 0);
  END IF;

  IF v_code_type = 'CONTRACT' THEN
    RETURN IF(v_person_code REGEXP '^SLC[0-9]{3,}$' AND v_seq >= 1, 1, 0);
  END IF;

  RETURN 0;
END$$
DELIMITER ;
