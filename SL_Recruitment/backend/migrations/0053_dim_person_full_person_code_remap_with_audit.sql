-- Full deterministic remap of dim_person.person_code with audit logging.
-- Ordering rules:
--   1. Principals: SL001-SL010 by join_date ASC NULLS LAST, person_id ASC
--   2. Non-principals: resolved employment type + join_date ASC NULLS LAST, person_id ASC
--      Permanent -> SL011+
--      Intern -> SLI001+
--      Contract -> SLC001+
-- Special reserved_person_code and special_digit_root rules are preserved through sp_dim_person_assign_code.

USE sl_platform;

CREATE TABLE IF NOT EXISTS `dim_person_code_remap_run` (
  `run_id` BIGINT NOT NULL AUTO_INCREMENT,
  `remap_scope` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `started_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` DATETIME NULL,
  `changed_rows` INT NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  PRIMARY KEY (`run_id`)
);

CREATE TABLE IF NOT EXISTS `dim_person_code_remap_audit` (
  `audit_id` BIGINT NOT NULL AUTO_INCREMENT,
  `run_id` BIGINT NOT NULL,
  `person_id` VARCHAR(64) NOT NULL,
  `full_name` VARCHAR(255) NULL,
  `principal_flag` TINYINT(1) NOT NULL DEFAULT 0,
  `join_date` DATE NULL,
  `resolved_group` VARCHAR(16) NOT NULL,
  `old_employment_type` VARCHAR(64) NULL,
  `new_employment_type` VARCHAR(64) NULL,
  `old_person_code` VARCHAR(64) NULL,
  `new_person_code` VARCHAR(64) NULL,
  `changed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  KEY `ix_dim_person_code_remap_audit_run_id` (`run_id`),
  KEY `ix_dim_person_code_remap_audit_person_id` (`person_id`)
);

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS sp_dim_person_full_person_code_remap_with_audit;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bi;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bu;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE PROCEDURE sp_dim_person_full_person_code_remap_with_audit()
main: BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE v_run_id BIGINT DEFAULT NULL;
  DECLARE v_changed_rows INT DEFAULT 0;
  DECLARE v_principal_count INT DEFAULT 0;

  DECLARE v_person_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_full_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_principal_flag TINYINT;
  DECLARE v_employment_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_reserved_person_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_special_digit_root TINYINT;

  DECLARE cur_people CURSOR FOR
    SELECT
      t.`person_id`,
      t.`full_name`,
      t.`principal_flag`,
      t.`target_employment_type`,
      t.`reserved_person_code`,
      t.`special_digit_root`
    FROM `tmp_dim_person_remap_snapshot` t
    WHERE t.`principal_flag` = 0
    ORDER BY CASE
               WHEN NULLIF(TRIM(COALESCE(t.`reserved_person_code`, '')), '') IS NULL THEN 1
               ELSE 0
             END,
             t.`sort_join_date_null`,
             t.`sort_join_date`,
             t.`person_id`;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    IF v_run_id IS NOT NULL THEN
      UPDATE `dim_person_code_remap_run`
      SET `status` = 'FAILED',
          `completed_at` = NOW(),
          `notes` = 'SQL exception during full person_code remap.'
      WHERE `run_id` = v_run_id;
    END IF;
    RESIGNAL;
  END;

  INSERT INTO `dim_person_code_remap_run` (`remap_scope`, `status`, `notes`)
  VALUES ('FULL_RESEQUENCE', 'RUNNING', 'Full deterministic person_code remap by principal flag, resolved employment type, DOJ, and person_id.');
  SET v_run_id = LAST_INSERT_ID();

  START TRANSACTION;

  CALL sp_dim_person_seed_principal_flags();
  CALL sp_dim_person_apply_special_cases();

  UPDATE `dim_person`
  SET `employment_type` = fn_dim_person_normalize_employment_type(`employment_type`, `job_title`, `email`)
  WHERE COALESCE(TRIM(`employment_type`), '') COLLATE utf8mb4_unicode_ci
    <> COALESCE(TRIM(fn_dim_person_normalize_employment_type(`employment_type`, `job_title`, `email`)), '') COLLATE utf8mb4_unicode_ci;

  DROP TEMPORARY TABLE IF EXISTS `tmp_dim_person_remap_snapshot`;
  CREATE TEMPORARY TABLE `tmp_dim_person_remap_snapshot` (
    `person_id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `full_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `principal_flag` TINYINT(1) NOT NULL,
    `join_date` DATE NULL,
    `sort_join_date_null` TINYINT(1) NOT NULL,
    `sort_join_date` DATE NULL,
    `old_employment_type` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `target_employment_type` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `resolved_group` VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `old_person_code` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `reserved_person_code` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    `special_digit_root` TINYINT NULL,
    PRIMARY KEY (`person_id`)
  ) ENGINE=InnoDB;

  INSERT INTO `tmp_dim_person_remap_snapshot` (
    `person_id`,
    `full_name`,
    `principal_flag`,
    `join_date`,
    `sort_join_date_null`,
    `sort_join_date`,
    `old_employment_type`,
    `target_employment_type`,
    `resolved_group`,
    `old_person_code`,
    `reserved_person_code`,
    `special_digit_root`
  )
  SELECT
    p.`person_id`,
    COALESCE(
      NULLIF(TRIM(p.`display_name`), ''),
      NULLIF(TRIM(p.`full_name`), ''),
      NULLIF(TRIM(CONCAT_WS(' ', p.`first_name`, p.`last_name`)), '')
    ) AS full_name,
    IFNULL(p.`principal_flag`, 0) AS principal_flag,
    p.`join_date`,
    CASE WHEN p.`join_date` IS NULL THEN 1 ELSE 0 END AS sort_join_date_null,
    p.`join_date` AS sort_join_date,
    p.`employment_type`,
    fn_dim_person_normalize_employment_type(p.`employment_type`, p.`job_title`, p.`email`) AS target_employment_type,
    CASE
      WHEN IFNULL(p.`principal_flag`, 0) = 1 THEN 'PRINCIPAL'
      WHEN fn_dim_person_normalize_employment_type(p.`employment_type`, p.`job_title`, p.`email`) = 'Intern' THEN 'INTERN'
      WHEN fn_dim_person_normalize_employment_type(p.`employment_type`, p.`job_title`, p.`email`) = 'Contract' THEN 'CONTRACT'
      ELSE 'EMPLOYEE'
    END AS resolved_group,
    p.`person_code`,
    p.`reserved_person_code`,
    p.`special_digit_root`
  FROM `dim_person` p;

  SELECT COUNT(*)
  INTO v_principal_count
  FROM `tmp_dim_person_remap_snapshot`
  WHERE `principal_flag` = 1;

  IF v_principal_count > 10 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Principal count exceeds the SL001-SL010 capacity.';
  END IF;

  UPDATE `dim_person`
  SET `person_code` = CONCAT('TMPRMAP_', `person_id`);

  UPDATE `dim_person`
  JOIN (
    SELECT
      s.`person_id`,
      fn_dim_person_format_code(
        'PRINCIPAL',
        ROW_NUMBER() OVER (
          ORDER BY s.`sort_join_date_null`, s.`sort_join_date`, s.`person_id`
        )
      ) AS target_person_code
    FROM `tmp_dim_person_remap_snapshot` s
    WHERE s.`principal_flag` = 1
  ) plan
    ON plan.`person_id` COLLATE utf8mb4_unicode_ci = `dim_person`.`person_id` COLLATE utf8mb4_unicode_ci
  SET `dim_person`.`person_code` = plan.`target_person_code`,
      `dim_person`.`employment_type` = 'Permanent',
      `dim_person`.`updated_at` = NOW();

  UPDATE `dim_person_code_counter`
  SET `next_seq` = CASE
      WHEN `code_type` = 'PRINCIPAL' THEN LEAST(11, v_principal_count + 1)
      WHEN `code_type` = 'EMPLOYEE' THEN 11
      ELSE 1
    END,
    `updated_at` = NOW();

  OPEN cur_people;

  read_loop: LOOP
    FETCH cur_people
    INTO v_person_id, v_full_name, v_principal_flag, v_employment_type, v_reserved_person_code, v_special_digit_root;

    IF done = 1 THEN
      LEAVE read_loop;
    END IF;

    SET @generated_person_code = NULL;
    CALL sp_dim_person_assign_code(
      v_person_id,
      v_full_name,
      v_principal_flag,
      v_employment_type,
      v_reserved_person_code,
      v_special_digit_root,
      NULL,
      @generated_person_code
    );

    UPDATE `dim_person`
    SET `person_code` = @generated_person_code,
        `employment_type` = v_employment_type,
        `updated_at` = NOW()
    WHERE `person_id` COLLATE utf8mb4_unicode_ci = v_person_id COLLATE utf8mb4_unicode_ci;
  END LOOP;

  CLOSE cur_people;

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
    s.`person_id`,
    s.`full_name`,
    s.`principal_flag`,
    s.`join_date`,
    s.`resolved_group`,
    s.`old_employment_type`,
    p.`employment_type`,
    s.`old_person_code`,
    p.`person_code`,
    NOW()
  FROM `tmp_dim_person_remap_snapshot` s
  JOIN `dim_person` p
    ON p.`person_id` COLLATE utf8mb4_unicode_ci = s.`person_id` COLLATE utf8mb4_unicode_ci
  WHERE COALESCE(s.`old_person_code`, '') COLLATE utf8mb4_unicode_ci <> COALESCE(p.`person_code`, '') COLLATE utf8mb4_unicode_ci
     OR COALESCE(s.`old_employment_type`, '') COLLATE utf8mb4_unicode_ci <> COALESCE(p.`employment_type`, '') COLLATE utf8mb4_unicode_ci;

  SELECT COUNT(*)
  INTO v_changed_rows
  FROM `dim_person_code_remap_audit`
  WHERE `run_id` = v_run_id;

  CALL sp_dim_person_sync_code_counters();

  UPDATE `dim_person_code_remap_run`
  SET `status` = 'COMPLETED',
      `completed_at` = NOW(),
      `changed_rows` = v_changed_rows,
      `notes` = CONCAT('Full remap completed successfully. Changed rows: ', v_changed_rows, '.')
  WHERE `run_id` = v_run_id;

  COMMIT;

  DROP TEMPORARY TABLE IF EXISTS `tmp_dim_person_remap_snapshot`;
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

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bi;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bu;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

CALL sp_dim_person_full_person_code_remap_with_audit();

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
