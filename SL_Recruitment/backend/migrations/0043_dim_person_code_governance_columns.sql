-- Add governed person-code columns required for automatic allocation.
-- MySQL 8.0.4 compatible and safe to re-run.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS migrate_dim_person_code_governance_columns;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE PROCEDURE migrate_dim_person_code_governance_columns()
BEGIN
  DECLARE CONTINUE HANDLER FOR 1060 BEGIN END;
  DECLARE CONTINUE HANDLER FOR 1061 BEGIN END;

  ALTER TABLE `dim_person`
    ADD COLUMN `principal_flag` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 for Studio Lotus principals who occupy SL001-SL010 only' AFTER `employment_type`;
  ALTER TABLE `dim_person`
    ADD COLUMN `reserved_person_code` VARCHAR(64) NULL COMMENT 'Reserved/manual person code if valid and unused' AFTER `principal_flag`;
  ALTER TABLE `dim_person`
    ADD COLUMN `special_digit_root` TINYINT UNSIGNED NULL COMMENT 'Numerology digit root target from 1 to 9' AFTER `reserved_person_code`;

  ALTER TABLE `dim_person`
    ADD KEY `idx_dim_person_principal_join` (`principal_flag`, `join_date`, `person_id`);
  ALTER TABLE `dim_person`
    ADD KEY `idx_dim_person_reserved_person_code` (`reserved_person_code`);
  ALTER TABLE `dim_person`
    ADD KEY `idx_dim_person_person_code` (`person_code`);
END$$
DELIMITER ;

CALL migrate_dim_person_code_governance_columns();

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS migrate_dim_person_code_governance_columns;
SET sql_notes = IFNULL(@prev_sql_notes, 1);
