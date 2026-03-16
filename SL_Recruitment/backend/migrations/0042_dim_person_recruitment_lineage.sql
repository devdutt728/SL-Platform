-- Add recruitment lineage columns to dim_person so SLR candidate codes remain traceable
-- after conversion to employee person_code.
-- MySQL 8.0.4 compatible and safe to re-run.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS migrate_dim_person_recruitment_lineage;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE PROCEDURE migrate_dim_person_recruitment_lineage()
BEGIN
  DECLARE CONTINUE HANDLER FOR 1060 BEGIN END;
  DECLARE CONTINUE HANDLER FOR 1061 BEGIN END;

  ALTER TABLE `dim_person`
    ADD COLUMN `source_candidate_id` INT NULL COMMENT 'rec_candidate.candidate_id lineage from recruitment hire conversion' AFTER `source_system`;
  ALTER TABLE `dim_person`
    ADD COLUMN `source_candidate_code` VARCHAR(64) NULL COMMENT 'Original recruitment candidate code such as SLR-0123' AFTER `source_candidate_id`;

  ALTER TABLE `dim_person`
    ADD KEY `idx_dim_person_source_candidate_id` (`source_candidate_id`);
  ALTER TABLE `dim_person`
    ADD KEY `idx_dim_person_source_candidate_code` (`source_candidate_code`);
END$$
DELIMITER ;

CALL migrate_dim_person_recruitment_lineage();

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS migrate_dim_person_recruitment_lineage;
SET sql_notes = IFNULL(@prev_sql_notes, 1);
