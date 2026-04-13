USE `sl_project_planner`;

SET @schema_name = 'sl_project_planner';
SET @table_name = 'sl_project_planner';

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND COLUMN_NAME = 'change_reason') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD COLUMN `change_reason` TEXT NULL COMMENT ''Business reason for the scope, date, or ownership change.'' AFTER `change_type`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND COLUMN_NAME = 'approval_note') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD COLUMN `approval_note` TEXT NULL COMMENT ''Approval or rejection note recorded by the reviewer.'' AFTER `approval_status`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND COLUMN_NAME = 'approval_requested_at') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD COLUMN `approval_requested_at` DATETIME NULL COMMENT ''Timestamp when the row entered approval flow.'' AFTER `approval_note`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND COLUMN_NAME = 'approval_action_at') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD COLUMN `approval_action_at` DATETIME NULL COMMENT ''Timestamp when the last approval decision was made.'' AFTER `approval_requested_at`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
