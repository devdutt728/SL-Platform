-- Prevent special-root employee allocations from burning the base employee sequence,
-- then compact employee-code gaps while preserving fixed reserved/special slots.
-- MySQL 8.0.4 compatible.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS sp_dim_person_generate_code;
DROP PROCEDURE IF EXISTS sp_dim_person_employee_gap_compaction_with_audit;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bi;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bu;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
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
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_attempts INT DEFAULT 0;
  DECLARE v_next_seq INT DEFAULT NULL;
  DECLARE v_min_seq INT DEFAULT NULL;
  DECLARE v_max_seq INT DEFAULT NULL;
  DECLARE v_candidate_seq INT DEFAULT NULL;

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

  SELECT `next_seq`, `min_seq`, `max_seq`
  INTO v_next_seq, v_min_seq, v_max_seq
  FROM `dim_person_code_counter`
  WHERE `code_type` COLLATE utf8mb4_unicode_ci = v_code_type COLLATE utf8mb4_unicode_ci
  FOR UPDATE;

  IF v_next_seq IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'dim_person_code_counter row missing for requested code_type.';
  END IF;

  SET v_candidate_seq = GREATEST(IFNULL(v_next_seq, 1), IFNULL(v_min_seq, 1));

  generate_loop: LOOP
    SET v_attempts = v_attempts + 1;
    IF v_attempts > 50000 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unable to generate person_code within allowed attempts.';
    END IF;

    IF v_max_seq IS NOT NULL AND v_candidate_seq > v_max_seq THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No remaining person-code sequence for requested code_type.';
    END IF;

    SET v_candidate = fn_dim_person_format_code(v_code_type, v_candidate_seq);

    IF v_candidate IS NULL THEN
      SET v_candidate_seq = v_candidate_seq + 1;
      ITERATE generate_loop;
    END IF;

    IF p_desired_root IS NOT NULL AND fn_dim_person_digit_root(v_candidate) <> p_desired_root THEN
      SET v_candidate_seq = v_candidate_seq + 1;
      ITERATE generate_loop;
    END IF;

    SELECT COUNT(*)
    INTO v_exists
    FROM `dim_person`
    WHERE UPPER(TRIM(COALESCE(`person_code`, ''))) COLLATE utf8mb4_unicode_ci
      = v_candidate COLLATE utf8mb4_unicode_ci;

    IF v_exists > 0 THEN
      SET v_candidate_seq = v_candidate_seq + 1;
      ITERATE generate_loop;
    END IF;

    SET p_person_code = v_candidate;

    IF p_desired_root IS NULL THEN
      UPDATE `dim_person_code_counter`
      SET `next_seq` = GREATEST(`next_seq`, v_candidate_seq + 1),
          `updated_at` = NOW()
      WHERE `code_type` COLLATE utf8mb4_unicode_ci = v_code_type COLLATE utf8mb4_unicode_ci;
    END IF;

    LEAVE generate_loop;
  END LOOP;
END$$

CREATE PROCEDURE sp_dim_person_employee_gap_compaction_with_audit()
main: BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE v_run_id BIGINT DEFAULT NULL;
  DECLARE v_changed_rows INT DEFAULT 0;
  DECLARE v_invalid_fixed_count INT DEFAULT 0;
  DECLARE v_duplicate_fixed_slots INT DEFAULT 0;
  DECLARE v_next_seq INT DEFAULT 11;
  DECLARE v_person_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

  DECLARE cur_people CURSOR FOR
    SELECT t.`person_id`
    FROM `tmp_dim_person_employee_gap_snapshot` t
    WHERE t.`is_fixed` = 0
    ORDER BY t.`sort_join_date_null`, t.`sort_join_date`, t.`person_id`;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    IF v_run_id IS NOT NULL THEN
      UPDATE `dim_person_code_remap_run`
      SET `status` = 'FAILED',
          `completed_at` = NOW(),
          `notes` = 'SQL exception during employee gap compaction.'
      WHERE `run_id` = v_run_id;
    END IF;
    RESIGNAL;
  END;

  INSERT INTO `dim_person_code_remap_run` (`remap_scope`, `status`, `notes`)
  VALUES (
    'EMPLOYEE_GAP_COMPACTION',
    'RUNNING',
    'Employee-only resequence preserving fixed reserved/special slots and filling base-series gaps.'
  );
  SET v_run_id = LAST_INSERT_ID();

  START TRANSACTION;

  UPDATE `dim_person`
  SET `employment_type` = fn_dim_person_normalize_employment_type(`employment_type`, `job_title`, `email`)
  WHERE COALESCE(TRIM(`employment_type`), '') COLLATE utf8mb4_unicode_ci
    <> COALESCE(TRIM(fn_dim_person_normalize_employment_type(`employment_type`, `job_title`, `email`)), '') COLLATE utf8mb4_unicode_ci;

  DROP TEMPORARY TABLE IF EXISTS `tmp_dim_person_employee_gap_snapshot`;
  CREATE TEMPORARY TABLE `tmp_dim_person_employee_gap_snapshot` (
    `person_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `full_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `join_date` DATE NULL,
    `sort_join_date_null` TINYINT(1) NOT NULL,
    `sort_join_date` DATE NULL,
    `old_employment_type` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `target_employment_type` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `old_person_code` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `reserved_person_code` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `special_digit_root` TINYINT NULL,
    `fixed_reason` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `is_fixed` TINYINT(1) NOT NULL DEFAULT 0,
    `fixed_seq` INT NULL,
    `target_seq` INT NULL,
    `target_person_code` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    PRIMARY KEY (`person_id`),
    KEY `ix_tmp_dim_person_employee_gap_snapshot_fixed_seq` (`fixed_seq`),
    KEY `ix_tmp_dim_person_employee_gap_snapshot_target_seq` (`target_seq`)
  ) ENGINE=InnoDB;

  INSERT INTO `tmp_dim_person_employee_gap_snapshot` (
    `person_id`,
    `full_name`,
    `join_date`,
    `sort_join_date_null`,
    `sort_join_date`,
    `old_employment_type`,
    `target_employment_type`,
    `old_person_code`,
    `reserved_person_code`,
    `special_digit_root`,
    `fixed_reason`,
    `is_fixed`,
    `fixed_seq`,
    `target_seq`,
    `target_person_code`
  )
  SELECT
    p.`person_id`,
    COALESCE(
      NULLIF(TRIM(p.`display_name`), ''),
      NULLIF(TRIM(p.`full_name`), ''),
      NULLIF(TRIM(CONCAT_WS(' ', p.`first_name`, p.`last_name`)), '')
    ) AS full_name,
    p.`join_date`,
    CASE WHEN p.`join_date` IS NULL THEN 1 ELSE 0 END AS sort_join_date_null,
    p.`join_date` AS sort_join_date,
    p.`employment_type`,
    fn_dim_person_normalize_employment_type(p.`employment_type`, p.`job_title`, p.`email`) AS target_employment_type,
    p.`person_code`,
    NULLIF(UPPER(TRIM(COALESCE(p.`reserved_person_code`, ''))), '') AS reserved_person_code,
    p.`special_digit_root`,
    CASE
      WHEN NULLIF(UPPER(TRIM(COALESCE(p.`reserved_person_code`, ''))), '') IS NOT NULL THEN 'RESERVED'
      WHEN p.`special_digit_root` IS NOT NULL THEN 'SPECIAL_ROOT'
      ELSE NULL
    END AS fixed_reason,
    CASE
      WHEN NULLIF(UPPER(TRIM(COALESCE(p.`reserved_person_code`, ''))), '') IS NOT NULL THEN 1
      WHEN p.`special_digit_root` IS NOT NULL THEN 1
      ELSE 0
    END AS is_fixed,
    CASE
      WHEN NULLIF(UPPER(TRIM(COALESCE(p.`reserved_person_code`, ''))), '') IS NOT NULL
           AND fn_dim_person_code_is_valid('EMPLOYEE', p.`reserved_person_code`) = 1
        THEN fn_dim_person_code_seq(p.`reserved_person_code`)
      WHEN p.`special_digit_root` IS NOT NULL
           AND fn_dim_person_code_is_valid('EMPLOYEE', p.`person_code`) = 1
           AND fn_dim_person_digit_root(p.`person_code`) = p.`special_digit_root`
        THEN fn_dim_person_code_seq(p.`person_code`)
      ELSE NULL
    END AS fixed_seq,
    NULL AS target_seq,
    NULL AS target_person_code
  FROM `dim_person` p
  WHERE IFNULL(p.`principal_flag`, 0) = 0
    AND fn_dim_person_normalize_employment_type(p.`employment_type`, p.`job_title`, p.`email`) = 'Permanent';

  SELECT COUNT(*)
  INTO v_invalid_fixed_count
  FROM `tmp_dim_person_employee_gap_snapshot`
  WHERE `is_fixed` = 1
    AND `fixed_seq` IS NULL;

  IF v_invalid_fixed_count > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee gap compaction found fixed-slot rows without a valid fixed sequence.';
  END IF;

  SELECT COUNT(*)
  INTO v_duplicate_fixed_slots
  FROM (
    SELECT `fixed_seq`
    FROM `tmp_dim_person_employee_gap_snapshot`
    WHERE `is_fixed` = 1
      AND `fixed_seq` IS NOT NULL
    GROUP BY `fixed_seq`
    HAVING COUNT(*) > 1
  ) dup;

  IF v_duplicate_fixed_slots > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee gap compaction found duplicate fixed employee-code slots.';
  END IF;

  UPDATE `tmp_dim_person_employee_gap_snapshot`
  SET `target_seq` = `fixed_seq`,
      `target_person_code` = fn_dim_person_format_code('EMPLOYEE', `fixed_seq`)
  WHERE `is_fixed` = 1;

  UPDATE `dim_person` p
  JOIN `tmp_dim_person_employee_gap_snapshot` t
    ON t.`person_id` COLLATE utf8mb4_unicode_ci = p.`person_id` COLLATE utf8mb4_unicode_ci
  SET p.`person_code` = CONCAT('TMPGCMP_', p.`person_id`),
      p.`updated_at` = NOW();

  OPEN cur_people;

  read_loop: LOOP
    FETCH cur_people INTO v_person_id;

    IF done = 1 THEN
      LEAVE read_loop;
    END IF;

    allocate_loop: LOOP
      IF EXISTS (
        SELECT 1
        FROM `tmp_dim_person_employee_gap_snapshot`
        WHERE `target_seq` = v_next_seq
      ) THEN
        SET v_next_seq = v_next_seq + 1;
        ITERATE allocate_loop;
      END IF;

      UPDATE `tmp_dim_person_employee_gap_snapshot`
      SET `target_seq` = v_next_seq,
          `target_person_code` = fn_dim_person_format_code('EMPLOYEE', v_next_seq)
      WHERE `person_id` COLLATE utf8mb4_unicode_ci = v_person_id COLLATE utf8mb4_unicode_ci;

      SET v_next_seq = v_next_seq + 1;
      LEAVE allocate_loop;
    END LOOP;
  END LOOP;

  CLOSE cur_people;

  UPDATE `dim_person` p
  JOIN `tmp_dim_person_employee_gap_snapshot` t
    ON t.`person_id` COLLATE utf8mb4_unicode_ci = p.`person_id` COLLATE utf8mb4_unicode_ci
  SET p.`person_code` = t.`target_person_code`,
      p.`employment_type` = t.`target_employment_type`,
      p.`updated_at` = NOW();

  INSERT INTO `dim_person_code_remap_audit` (
    `run_id`,
    `person_id`,
    `full_name`,
    `principal_flag`,
    `join_date`,
    `resolved_group`,
    `old_employment_type`,
    `new_employment_type`,
    `old_person_code`,
    `new_person_code`,
    `changed_at`
  )
  SELECT
    v_run_id,
    t.`person_id`,
    t.`full_name`,
    0,
    t.`join_date`,
    'EMPLOYEE',
    t.`old_employment_type`,
    p.`employment_type`,
    t.`old_person_code`,
    p.`person_code`,
    NOW()
  FROM `tmp_dim_person_employee_gap_snapshot` t
  JOIN `dim_person` p
    ON p.`person_id` COLLATE utf8mb4_unicode_ci = t.`person_id` COLLATE utf8mb4_unicode_ci
  WHERE COALESCE(t.`old_person_code`, '') COLLATE utf8mb4_unicode_ci <> COALESCE(p.`person_code`, '') COLLATE utf8mb4_unicode_ci
     OR COALESCE(t.`old_employment_type`, '') COLLATE utf8mb4_unicode_ci <> COALESCE(p.`employment_type`, '') COLLATE utf8mb4_unicode_ci;

  SELECT COUNT(*)
  INTO v_changed_rows
  FROM `dim_person_code_remap_audit`
  WHERE `run_id` = v_run_id;

  CALL sp_dim_person_sync_code_counters();

  UPDATE `dim_person_code_remap_run`
  SET `status` = 'COMPLETED',
      `completed_at` = NOW(),
      `changed_rows` = v_changed_rows,
      `notes` = CONCAT('Employee gap compaction completed successfully. Changed rows: ', v_changed_rows, '.')
  WHERE `run_id` = v_run_id;

  COMMIT;

  DROP TEMPORARY TABLE IF EXISTS `tmp_dim_person_employee_gap_snapshot`;
END$$
DELIMITER ;

CALL sp_dim_person_employee_gap_compaction_with_audit();

DELIMITER $$
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
