USE `sl_project_planner`;

SET @schema_name = 'sl_project_planner';
SET @table_name = 'sl_project_planner';

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND COLUMN_NAME = 'schedule_mode') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD COLUMN `schedule_mode` ENUM(''manual'',''auto'') NOT NULL DEFAULT ''manual'' COMMENT ''Controls whether live dates are manually entered or driven by dependency scheduling.'' AFTER `dependency_codes`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND COLUMN_NAME = 'scheduled_start_date') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD COLUMN `scheduled_start_date` DATE NULL COMMENT ''Calculated start date produced by dependency scheduling.'' AFTER `schedule_mode`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND COLUMN_NAME = 'scheduled_end_date') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD COLUMN `scheduled_end_date` DATE NULL COMMENT ''Calculated finish date produced by dependency scheduling.'' AFTER `scheduled_start_date`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND COLUMN_NAME = 'float_days') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD COLUMN `float_days` DECIMAL(8,2) NULL COMMENT ''Computed float or slack in days.'' AFTER `scheduled_end_date`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND COLUMN_NAME = 'is_critical') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD COLUMN `is_critical` TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''Marks rows on the calculated critical path.'' AFTER `float_days`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND COLUMN_NAME = 'last_schedule_run_at') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD COLUMN `last_schedule_run_at` DATETIME NULL COMMENT ''Timestamp of the last dependency scheduling run affecting the row.'' AFTER `is_critical`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND COLUMN_NAME = 'project_anchor_person_id') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD COLUMN `project_anchor_person_id` VARCHAR(64) NULL COMMENT ''Platform person_id of the Project Anchor who carries Group Leader-equivalent planner authority.'' AFTER `group_leader_person_id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = @table_name AND INDEX_NAME = 'idx_sl_project_planner_project_anchor') = 0,
  'ALTER TABLE `sl_project_planner`.`sl_project_planner` ADD KEY `idx_sl_project_planner_project_anchor` (`project_anchor_person_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `planner_activity_dependency` (
  `dependency_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_code` VARCHAR(64) NOT NULL,
  `planner_row_id` BIGINT NOT NULL,
  `predecessor_row_id` BIGINT NOT NULL,
  `dependency_type` ENUM('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish') NOT NULL DEFAULT 'finish_to_start',
  `lag_days` DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  `created_by_person_id` VARCHAR(64) NULL,
  `updated_by_person_id` VARCHAR(64) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dependency_id`),
  UNIQUE KEY `uq_planner_dependency_pair` (`planner_row_id`, `predecessor_row_id`, `dependency_type`),
  KEY `idx_planner_dependency_project` (`project_code`),
  KEY `idx_planner_dependency_predecessor` (`predecessor_row_id`),
  CONSTRAINT `fk_planner_dependency_row`
    FOREIGN KEY (`planner_row_id`) REFERENCES `sl_project_planner` (`planner_row_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_planner_dependency_predecessor`
    FOREIGN KEY (`predecessor_row_id`) REFERENCES `sl_project_planner` (`planner_row_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Dependency graph edges used for schedule recalculation and critical-path style reporting.';

CREATE TABLE IF NOT EXISTS `planner_change_request` (
  `request_id` BIGINT NOT NULL AUTO_INCREMENT,
  `planner_row_id` BIGINT NULL,
  `project_code` VARCHAR(64) NOT NULL,
  `request_type` ENUM('scope', 'schedule', 'assignment', 'status', 'delete', 'document') NOT NULL DEFAULT 'schedule',
  `request_status` ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  `requested_by_person_id` VARCHAR(64) NULL,
  `requester_role` VARCHAR(64) NULL,
  `approver_person_id` VARCHAR(64) NULL,
  `approver_role` VARCHAR(64) NULL,
  `request_reason` TEXT NULL,
  `approval_note` TEXT NULL,
  `before_json` LONGTEXT NULL,
  `proposed_json` LONGTEXT NULL,
  `decided_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `idx_planner_request_project_status` (`project_code`, `request_status`),
  KEY `idx_planner_request_row` (`planner_row_id`),
  KEY `idx_planner_request_requested_by` (`requested_by_person_id`),
  KEY `idx_planner_request_approver` (`approver_person_id`),
  CONSTRAINT `fk_planner_request_row`
    FOREIGN KEY (`planner_row_id`) REFERENCES `sl_project_planner` (`planner_row_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Formal change and approval requests raised by Architects, Senior Architects, Group Leaders, or Project Anchors.';

CREATE TABLE IF NOT EXISTS `planner_audit_log` (
  `audit_log_id` BIGINT NOT NULL AUTO_INCREMENT,
  `planner_row_id` BIGINT NULL,
  `project_code` VARCHAR(64) NOT NULL,
  `entity_type` ENUM('planner_row', 'dependency', 'document', 'document_version', 'change_request', 'baseline', 'schedule') NOT NULL,
  `entity_id` VARCHAR(64) NOT NULL,
  `action_type` VARCHAR(64) NOT NULL,
  `change_summary` VARCHAR(255) NULL,
  `before_json` LONGTEXT NULL,
  `after_json` LONGTEXT NULL,
  `request_id` BIGINT NULL,
  `actor_person_id` VARCHAR(64) NULL,
  `actor_role` VARCHAR(64) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_log_id`),
  KEY `idx_planner_audit_project` (`project_code`, `created_at`),
  KEY `idx_planner_audit_row` (`planner_row_id`, `created_at`),
  KEY `idx_planner_audit_entity` (`entity_type`, `entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Immutable activity log for every planner change, approval, document upload, dependency update, and schedule run.';

CREATE TABLE IF NOT EXISTS `planner_document` (
  `document_id` BIGINT NOT NULL AUTO_INCREMENT,
  `planner_row_id` BIGINT NULL,
  `project_code` VARCHAR(64) NOT NULL,
  `document_code` VARCHAR(64) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `discipline_code` VARCHAR(64) NULL,
  `category` ENUM('contract', 'drawing', 'submission', 'minutes', 'reference', 'change_request', 'general') NOT NULL DEFAULT 'general',
  `current_version_no` INT NOT NULL DEFAULT 0,
  `status` ENUM('draft', 'active', 'superseded', 'archived') NOT NULL DEFAULT 'draft',
  `created_by_person_id` VARCHAR(64) NULL,
  `updated_by_person_id` VARCHAR(64) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`document_id`),
  UNIQUE KEY `uq_planner_document_project_code` (`project_code`, `document_code`),
  KEY `idx_planner_document_row` (`planner_row_id`),
  CONSTRAINT `fk_planner_document_row`
    FOREIGN KEY (`planner_row_id`) REFERENCES `sl_project_planner` (`planner_row_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Document register for contracts, drawings, notes, submissions, and supporting planner files.';

CREATE TABLE IF NOT EXISTS `planner_document_version` (
  `document_version_id` BIGINT NOT NULL AUTO_INCREMENT,
  `document_id` BIGINT NOT NULL,
  `version_no` INT NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `stored_filename` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(128) NULL,
  `file_size_bytes` BIGINT NULL,
  `storage_path` VARCHAR(512) NOT NULL,
  `checksum_sha256` VARCHAR(64) NULL,
  `version_note` TEXT NULL,
  `uploaded_by_person_id` VARCHAR(64) NULL,
  `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`document_version_id`),
  UNIQUE KEY `uq_planner_document_version` (`document_id`, `version_no`),
  CONSTRAINT `fk_planner_document_version_document`
    FOREIGN KEY (`document_id`) REFERENCES `planner_document` (`document_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Version history for all stored planner documents.';

CREATE TABLE IF NOT EXISTS `planner_project_baseline` (
  `baseline_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_code` VARCHAR(64) NOT NULL,
  `baseline_name` VARCHAR(128) NOT NULL,
  `baseline_type` ENUM('contract', 'approved_change', 'working_snapshot') NOT NULL DEFAULT 'contract',
  `snapshot_json` LONGTEXT NOT NULL,
  `created_by_person_id` VARCHAR(64) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`baseline_id`),
  KEY `idx_planner_baseline_project` (`project_code`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Saved project-wide baseline snapshots to compare contract, approved-change, and working-plan states.';
