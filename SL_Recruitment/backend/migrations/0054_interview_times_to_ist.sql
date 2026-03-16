-- Normalize recruitment interview datetimes to IST (+05:30) at rest.
-- This backfills existing interview-domain rows that were previously stored as UTC-naive.
-- The migration is guarded by a marker table so it will not double-shift on re-run.

USE sl_platform;

CREATE TABLE IF NOT EXISTS `rec_schema_migration_marker` (
  `migration_key` VARCHAR(100) NOT NULL,
  `applied_at` DATETIME NOT NULL,
  PRIMARY KEY (`migration_key`)
);

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS migrate_interview_times_to_ist;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE PROCEDURE migrate_interview_times_to_ist()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM `rec_schema_migration_marker`
    WHERE `migration_key` = '0054_interview_times_to_ist'
  ) THEN
    UPDATE `rec_candidate_interview`
    SET
      `scheduled_start_at` = DATE_ADD(`scheduled_start_at`, INTERVAL 330 MINUTE),
      `scheduled_end_at` = DATE_ADD(`scheduled_end_at`, INTERVAL 330 MINUTE),
      `created_at` = DATE_ADD(`created_at`, INTERVAL 330 MINUTE),
      `updated_at` = DATE_ADD(`updated_at`, INTERVAL 330 MINUTE);

    UPDATE `rec_candidate_interview_slot`
    SET
      `slot_start_at` = DATE_ADD(`slot_start_at`, INTERVAL 330 MINUTE),
      `slot_end_at` = DATE_ADD(`slot_end_at`, INTERVAL 330 MINUTE),
      `expires_at` = CASE
        WHEN `expires_at` IS NULL THEN NULL
        ELSE DATE_ADD(`expires_at`, INTERVAL 330 MINUTE)
      END,
      `created_at` = DATE_ADD(`created_at`, INTERVAL 330 MINUTE),
      `updated_at` = DATE_ADD(`updated_at`, INTERVAL 330 MINUTE);

    UPDATE `rec_candidate_interview_assessment`
    SET
      `submitted_at` = CASE
        WHEN `submitted_at` IS NULL THEN NULL
        ELSE DATE_ADD(`submitted_at`, INTERVAL 330 MINUTE)
      END,
      `created_at` = DATE_ADD(`created_at`, INTERVAL 330 MINUTE),
      `updated_at` = DATE_ADD(`updated_at`, INTERVAL 330 MINUTE);

    UPDATE `rec_candidate_event`
    SET `meta_json` = JSON_SET(
      `meta_json`,
      '$.scheduled_start_at',
      DATE_FORMAT(
        DATE_ADD(
          STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(`meta_json`, '$.scheduled_start_at')), '%Y-%m-%dT%H:%i:%s'),
          INTERVAL 330 MINUTE
        ),
        '%Y-%m-%dT%H:%i:%s'
      ),
      '$.scheduled_end_at',
      DATE_FORMAT(
        DATE_ADD(
          STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(`meta_json`, '$.scheduled_end_at')), '%Y-%m-%dT%H:%i:%s'),
          INTERVAL 330 MINUTE
        ),
        '%Y-%m-%dT%H:%i:%s'
      )
    )
    WHERE `related_entity_type` = 'interview'
      AND JSON_EXTRACT(`meta_json`, '$.scheduled_start_at') IS NOT NULL
      AND JSON_EXTRACT(`meta_json`, '$.scheduled_end_at') IS NOT NULL;

    INSERT INTO `rec_schema_migration_marker` (`migration_key`, `applied_at`)
    VALUES (
      '0054_interview_times_to_ist',
      CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')
    );
  END IF;
END$$
DELIMITER ;

CALL migrate_interview_times_to_ist();

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS migrate_interview_times_to_ist;
SET sql_notes = IFNULL(@prev_sql_notes, 1);
