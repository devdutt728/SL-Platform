CREATE SCHEMA IF NOT EXISTS `sl_project_planner`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `sl_project_planner`;

CREATE TABLE IF NOT EXISTS `sl_project_planner` (
  `planner_row_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Primary key for each planner row.',
  `project_code` VARCHAR(64) NOT NULL COMMENT 'Short stable project identifier used in filters, reporting, and imports.',
  `project_name` VARCHAR(255) NOT NULL COMMENT 'Readable project name shown in the UI and reports.',
  `contract_reference` VARCHAR(128) NULL COMMENT 'Contract or work-order reference for baseline tracking.',
  `discipline_code` VARCHAR(64) NULL COMMENT 'Discipline bucket such as architecture or interior for future team expansion.',
  `stage_code` VARCHAR(64) NULL COMMENT 'Project stage or phase identifier used for grouping and timeline views.',
  `package_code` VARCHAR(128) NULL COMMENT 'Optional package/workstream code inside the project.',
  `activity_code` VARCHAR(64) NOT NULL COMMENT 'Stable activity identifier within the project.',
  `activity_title` VARCHAR(255) NOT NULL COMMENT 'Short task or deliverable title.',
  `activity_description` TEXT NULL COMMENT 'Detailed description of the task, deliverable, or scope note.',
  `plan_layer` ENUM('contract_baseline', 'live_plan', 'approved_change') NOT NULL DEFAULT 'live_plan' COMMENT 'Separates original contract scope from the current working plan and approved changes.',
  `source_type` ENUM('contract', 'approved_change', 'internal') NOT NULL DEFAULT 'contract' COMMENT 'Explains why the row exists: contract scope, approved change, or internal team activity.',
  `change_type` ENUM('none', 'added', 'modified', 'removed') NOT NULL DEFAULT 'none' COMMENT 'Tracks whether this row was inserted, changed, or removed versus the original scope.',
  `change_reason` TEXT NULL COMMENT 'Business reason for the scope, date, or ownership change.',
  `activity_status` ENUM('not_started', 'in_progress', 'to_be_checked', 'completed', 'hold') NOT NULL DEFAULT 'not_started' COMMENT 'Operational progress state used by delivery teams.',
  `approval_status` ENUM('not_required', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'not_required' COMMENT 'Approval state for rows that need review before becoming effective.',
  `approval_note` TEXT NULL COMMENT 'Approval or rejection note recorded by the reviewer.',
  `approval_requested_at` DATETIME NULL COMMENT 'Timestamp when the row entered approval flow.',
  `approval_action_at` DATETIME NULL COMMENT 'Timestamp when the last approval decision was made.',
  `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium' COMMENT 'Simple urgency flag for team prioritization.',
  `baseline_start_date` DATE NULL COMMENT 'Date promised in the contract or baseline plan.',
  `baseline_end_date` DATE NULL COMMENT 'Baseline finish date committed against the contract or approved plan.',
  `live_start_date` DATE NULL COMMENT 'Current working start date after operational adjustments.',
  `live_end_date` DATE NULL COMMENT 'Current working finish date after operational adjustments.',
  `actual_start_date` DATE NULL COMMENT 'Real execution start date captured from the team.',
  `actual_end_date` DATE NULL COMMENT 'Real execution finish date captured from the team.',
  `duration_days` DECIMAL(8,2) NULL COMMENT 'Working duration in days used for timeline and reporting.',
  `percent_complete` DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Completion percentage for dashboards and charts.',
  `dependency_codes` VARCHAR(255) NULL COMMENT 'Comma-separated predecessor activity codes for the MVP version.',
  `group_leader_person_id` VARCHAR(64) NULL COMMENT 'Platform person_id of the Group Leader responsible for this scope line.',
  `senior_architect_person_id` VARCHAR(64) NULL COMMENT 'Platform person_id of the Senior Architect leading review for this scope line.',
  `assigned_to_person_id` VARCHAR(64) NULL COMMENT 'Platform person_id of the Architect or team member currently assigned.',
  `requested_by_person_id` VARCHAR(64) NULL COMMENT 'Platform person_id of the person who raised a change or approval request.',
  `approved_by_person_id` VARCHAR(64) NULL COMMENT 'Platform person_id of the approver who accepted the row or change.',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Soft-delete flag so records can be hidden without losing history.',
  `deleted_at` DATETIME NULL COMMENT 'Timestamp of soft deletion or archival.',
  `created_by_person_id` VARCHAR(64) NULL COMMENT 'Platform person_id of the creator.',
  `updated_by_person_id` VARCHAR(64) NULL COMMENT 'Platform person_id of the last updater.',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Row creation timestamp.',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Row update timestamp.',
  PRIMARY KEY (`planner_row_id`),
  UNIQUE KEY `uq_sl_project_planner_project_activity_layer` (`project_code`, `activity_code`, `plan_layer`),
  KEY `idx_sl_project_planner_project_stage` (`project_code`, `stage_code`, `plan_layer`),
  KEY `idx_sl_project_planner_assignment` (`assigned_to_person_id`, `activity_status`),
  KEY `idx_sl_project_planner_approval` (`approval_status`, `approved_by_person_id`),
  KEY `idx_sl_project_planner_gl` (`group_leader_person_id`),
  KEY `idx_sl_project_planner_sa` (`senior_architect_person_id`),
  CONSTRAINT `fk_sl_project_planner_group_leader`
    FOREIGN KEY (`group_leader_person_id`) REFERENCES `sl_platform`.`dim_person` (`person_id`),
  CONSTRAINT `fk_sl_project_planner_senior_architect`
    FOREIGN KEY (`senior_architect_person_id`) REFERENCES `sl_platform`.`dim_person` (`person_id`),
  CONSTRAINT `fk_sl_project_planner_assigned_to`
    FOREIGN KEY (`assigned_to_person_id`) REFERENCES `sl_platform`.`dim_person` (`person_id`),
  CONSTRAINT `fk_sl_project_planner_requested_by`
    FOREIGN KEY (`requested_by_person_id`) REFERENCES `sl_platform`.`dim_person` (`person_id`),
  CONSTRAINT `fk_sl_project_planner_approved_by`
    FOREIGN KEY (`approved_by_person_id`) REFERENCES `sl_platform`.`dim_person` (`person_id`),
  CONSTRAINT `fk_sl_project_planner_created_by`
    FOREIGN KEY (`created_by_person_id`) REFERENCES `sl_platform`.`dim_person` (`person_id`),
  CONSTRAINT `fk_sl_project_planner_updated_by`
    FOREIGN KEY (`updated_by_person_id`) REFERENCES `sl_platform`.`dim_person` (`person_id`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Simple Studio Lotus planner MVP table storing project activities, baseline vs live dates, assignments, and approval ownership.';
