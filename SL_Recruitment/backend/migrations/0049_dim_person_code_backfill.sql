-- Backfill principal and managed person codes using governed allocation rules.
-- Principals are reassigned by DOJ order and receive SL001-SL010 only.
-- MySQL 8.0.4 compatible.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS sp_dim_person_backfill_person_codes;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE PROCEDURE sp_dim_person_backfill_person_codes()
main: BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE v_person_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_full_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_principal_flag TINYINT;
  DECLARE v_employment_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_reserved_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_special_digit_root TINYINT;
  DECLARE v_existing_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_new_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_principal_count INT DEFAULT 0;

  DECLARE cur_people CURSOR FOR
    SELECT
      p.`person_id`,
      COALESCE(
        NULLIF(TRIM(p.`full_name`), ''),
        NULLIF(TRIM(CONCAT_WS(' ', p.`first_name`, p.`last_name`)), '')
      ) AS full_name,
      IFNULL(p.`principal_flag`, 0) AS principal_flag,
      p.`employment_type`,
      p.`reserved_person_code`,
      p.`special_digit_root`,
      p.`person_code`
    FROM `dim_person` p
    WHERE IFNULL(p.`principal_flag`, 0) = 0
      AND (
        p.`person_code` IS NULL
        OR TRIM(p.`person_code`) = ''
        OR p.`person_code` LIKE 'TMPBKP\_%' ESCAPE '\\'
        OR fn_dim_person_code_is_valid(fn_dim_person_code_type(0, p.`employment_type`), p.`person_code`) = 0
        OR (
          NULLIF(TRIM(COALESCE(p.`reserved_person_code`, '')), '') IS NOT NULL
          AND UPPER(TRIM(COALESCE(p.`person_code`, ''))) COLLATE utf8mb4_unicode_ci
            <> UPPER(TRIM(p.`reserved_person_code`)) COLLATE utf8mb4_unicode_ci
        )
        OR (
          p.`special_digit_root` IS NOT NULL
          AND fn_dim_person_digit_root(p.`person_code`) <> p.`special_digit_root`
        )
      )
    ORDER BY CASE WHEN p.`join_date` IS NULL THEN 1 ELSE 0 END, p.`join_date`, p.`person_id`;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  CALL sp_dim_person_seed_principal_flags();
  CALL sp_dim_person_apply_special_cases();

  UPDATE `dim_person`
  SET `employment_type` = fn_dim_person_normalize_employment_type(`employment_type`, `job_title`, `email`)
  WHERE COALESCE(TRIM(`employment_type`), '') COLLATE utf8mb4_unicode_ci
    <> COALESCE(TRIM(fn_dim_person_normalize_employment_type(`employment_type`, `job_title`, `email`)), '') COLLATE utf8mb4_unicode_ci;

  SELECT COUNT(*)
  INTO v_principal_count
  FROM `dim_person`
  WHERE IFNULL(`principal_flag`, 0) = 1;

  IF v_principal_count > 10 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Principal count exceeds the SL001-SL010 capacity.';
  END IF;

  UPDATE `dim_person`
  SET `person_code` = CONCAT('TMPBKP_PRINC_', `person_id`)
  WHERE IFNULL(`principal_flag`, 0) = 1;

  UPDATE `dim_person`
  SET `person_code` = CONCAT('TMPBKP_REG_', `person_id`)
  WHERE IFNULL(`principal_flag`, 0) = 0
    AND `person_code` IS NOT NULL
    AND fn_dim_person_code_is_valid('PRINCIPAL', `person_code`) = 1;

  SET @principal_seq := 0;
  UPDATE `dim_person` p
  JOIN (
    SELECT x.`person_id`, (@principal_seq := @principal_seq + 1) AS seq_no
    FROM (
      SELECT `person_id`
      FROM `dim_person`
      WHERE IFNULL(`principal_flag`, 0) = 1
      ORDER BY CASE WHEN `join_date` IS NULL THEN 1 ELSE 0 END, `join_date`, `person_id`
    ) x
    CROSS JOIN (SELECT @principal_seq := 0) vars
  ) ord
    ON ord.`person_id` = p.`person_id`
  SET p.`person_code` = fn_dim_person_format_code('PRINCIPAL', ord.seq_no);

  CALL sp_dim_person_sync_code_counters();

  OPEN cur_people;

  read_loop: LOOP
    FETCH cur_people
    INTO v_person_id, v_full_name, v_principal_flag, v_employment_type, v_reserved_person_code, v_special_digit_root, v_existing_person_code;

    IF done = 1 THEN
      LEAVE read_loop;
    END IF;

    SET v_new_person_code = NULL;
    CALL sp_dim_person_assign_code(
      v_person_id,
      v_full_name,
      v_principal_flag,
      v_employment_type,
      v_reserved_person_code,
      v_special_digit_root,
      NULL,
      v_new_person_code
    );

    UPDATE `dim_person`
    SET `person_code` = v_new_person_code
    WHERE `person_id` COLLATE utf8mb4_unicode_ci = v_person_id COLLATE utf8mb4_unicode_ci;
  END LOOP;

  CLOSE cur_people;

  CALL sp_dim_person_sync_code_counters();
END$$
DELIMITER ;

CALL sp_dim_person_backfill_person_codes();
