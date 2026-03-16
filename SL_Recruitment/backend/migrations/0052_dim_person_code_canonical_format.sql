-- Canonicalize person_code formatting across dim_person and enforce exact format going forward.
-- Employee examples: SL0011 -> SL011, SL0114 -> SL114.
-- MySQL 8.0.4 compatible and safe to re-run.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP FUNCTION IF EXISTS fn_dim_person_code_is_valid;
DROP PROCEDURE IF EXISTS sp_dim_person_canonicalize_person_codes;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bi;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bu;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
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
  DECLARE v_expected VARCHAR(64);

  SET v_code_type = UPPER(TRIM(COALESCE(p_code_type, '')));
  SET v_person_code = UPPER(TRIM(COALESCE(p_person_code, '')));
  SET v_seq = fn_dim_person_code_seq(v_person_code);

  IF v_person_code = '' OR v_seq IS NULL THEN
    RETURN 0;
  END IF;

  SET v_expected = fn_dim_person_format_code(v_code_type, v_seq);
  IF v_expected IS NULL THEN
    RETURN 0;
  END IF;

  RETURN IF(v_person_code = v_expected, 1, 0);
END$$

CREATE PROCEDURE sp_dim_person_canonicalize_person_codes()
main: BEGIN
  DECLARE v_target_duplicates INT DEFAULT 0;

  UPDATE `dim_person`
  SET `employment_type` = fn_dim_person_normalize_employment_type(`employment_type`, `job_title`, `email`)
  WHERE COALESCE(TRIM(`employment_type`), '') COLLATE utf8mb4_unicode_ci
    <> COALESCE(TRIM(fn_dim_person_normalize_employment_type(`employment_type`, `job_title`, `email`)), '') COLLATE utf8mb4_unicode_ci;

  SELECT COUNT(*)
  INTO v_target_duplicates
  FROM (
    SELECT target_code, COUNT(*) AS cnt
    FROM (
      SELECT
        p.`person_id`,
        CASE
          WHEN IFNULL(p.`principal_flag`, 0) = 1 THEN fn_dim_person_format_code('PRINCIPAL', fn_dim_person_code_seq(p.`person_code`))
          WHEN UPPER(TRIM(COALESCE(p.`person_code`, ''))) LIKE 'SL%'
               AND UPPER(TRIM(COALESCE(p.`person_code`, ''))) NOT LIKE 'SLI%'
               AND UPPER(TRIM(COALESCE(p.`person_code`, ''))) NOT LIKE 'SLC%'
            THEN fn_dim_person_format_code('EMPLOYEE', fn_dim_person_code_seq(p.`person_code`))
          WHEN UPPER(TRIM(COALESCE(p.`person_code`, ''))) LIKE 'SLI%'
            THEN fn_dim_person_format_code('INTERN', fn_dim_person_code_seq(p.`person_code`))
          WHEN UPPER(TRIM(COALESCE(p.`person_code`, ''))) LIKE 'SLC%'
            THEN fn_dim_person_format_code('CONTRACT', fn_dim_person_code_seq(p.`person_code`))
          ELSE NULL
        END AS target_code
      FROM `dim_person` p
    ) mapped
    WHERE target_code IS NOT NULL
    GROUP BY target_code
    HAVING COUNT(*) > 1
  ) dupes;

  IF v_target_duplicates > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Canonical person_code remap aborted because target duplicates were detected.';
  END IF;

  UPDATE `dim_person`
  SET `person_code` = fn_dim_person_format_code('EMPLOYEE', fn_dim_person_code_seq(`person_code`))
  WHERE IFNULL(`principal_flag`, 0) = 0
    AND fn_dim_person_code_is_valid('EMPLOYEE', UPPER(TRIM(COALESCE(`person_code`, '')))) = 0
    AND UPPER(TRIM(COALESCE(`person_code`, ''))) LIKE 'SL%'
    AND UPPER(TRIM(COALESCE(`person_code`, ''))) NOT LIKE 'SLI%'
    AND UPPER(TRIM(COALESCE(`person_code`, ''))) NOT LIKE 'SLC%'
    AND fn_dim_person_format_code('EMPLOYEE', fn_dim_person_code_seq(`person_code`)) IS NOT NULL;

  CALL sp_dim_person_sync_code_counters();
END$$

CREATE TRIGGER trg_dim_person_person_code_bi
BEFORE INSERT ON `dim_person`
FOR EACH ROW FOLLOWS dim_person_bi
BEGIN
  DECLARE v_code_type VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_seq INT;
  DECLARE v_canonical_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

  SET NEW.`principal_flag` = IFNULL(NEW.`principal_flag`, 0);
  SET NEW.`reserved_person_code` = NULLIF(UPPER(TRIM(COALESCE(NEW.`reserved_person_code`, ''))), '');
  SET NEW.`employment_type` = fn_dim_person_normalize_employment_type(
    NEW.`employment_type`,
    NEW.`job_title`,
    NEW.`email`
  );

  IF NEW.`person_code` IS NULL OR TRIM(NEW.`person_code`) = '' THEN
    CALL sp_dim_person_assign_code(
      NEW.`person_id`,
      COALESCE(NULLIF(NEW.`full_name`, ''), TRIM(CONCAT_WS(' ', NEW.`first_name`, NEW.`last_name`))),
      NEW.`principal_flag`,
      NEW.`employment_type`,
      NEW.`reserved_person_code`,
      NEW.`special_digit_root`,
      NEW.`person_code`,
      @generated_person_code
    );
    SET NEW.`person_code` = @generated_person_code;
  ELSE
    SET v_code_type = fn_dim_person_code_type(NEW.`principal_flag`, NEW.`employment_type`);
    SET v_seq = fn_dim_person_code_seq(NEW.`person_code`);
    SET v_canonical_person_code = fn_dim_person_format_code(v_code_type, v_seq);

    IF v_canonical_person_code IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Provided person_code is invalid for the resolved employee type.';
    END IF;

    SET NEW.`person_code` = v_canonical_person_code;
  END IF;
END$$

CREATE TRIGGER trg_dim_person_person_code_bu
BEFORE UPDATE ON `dim_person`
FOR EACH ROW
BEGIN
  DECLARE v_code_type VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_seq INT;
  DECLARE v_canonical_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

  SET NEW.`principal_flag` = IFNULL(NEW.`principal_flag`, 0);
  SET NEW.`reserved_person_code` = NULLIF(UPPER(TRIM(COALESCE(NEW.`reserved_person_code`, ''))), '');
  SET NEW.`employment_type` = fn_dim_person_normalize_employment_type(
    NEW.`employment_type`,
    NEW.`job_title`,
    NEW.`email`
  );

  IF NEW.`person_code` IS NULL OR TRIM(NEW.`person_code`) = '' THEN
    CALL sp_dim_person_assign_code(
      NEW.`person_id`,
      COALESCE(NULLIF(NEW.`full_name`, ''), TRIM(CONCAT_WS(' ', NEW.`first_name`, NEW.`last_name`))),
      NEW.`principal_flag`,
      NEW.`employment_type`,
      NEW.`reserved_person_code`,
      NEW.`special_digit_root`,
      NEW.`person_code`,
      @generated_person_code
    );
    SET NEW.`person_code` = @generated_person_code;
  ELSE
    SET v_code_type = fn_dim_person_code_type(NEW.`principal_flag`, NEW.`employment_type`);
    SET v_seq = fn_dim_person_code_seq(NEW.`person_code`);
    SET v_canonical_person_code = fn_dim_person_format_code(v_code_type, v_seq);

    IF v_canonical_person_code IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Provided person_code is invalid for the resolved employee type.';
    END IF;

    SET NEW.`person_code` = v_canonical_person_code;
  END IF;
END$$
DELIMITER ;

CALL sp_dim_person_canonicalize_person_codes();

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS sp_dim_person_canonicalize_person_codes;
SET sql_notes = IFNULL(@prev_sql_notes, 1);
