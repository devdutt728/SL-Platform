-- Add non-duplicate Emp Master columns directly to dim_person.
-- MySQL 8.0.4 compatible one-go script.
-- Uses a handler for duplicate-column error (1060), so safe to re-run.
-- Canonical mappings remain:
-- employee_number->person_code, work_email->email, mobile_phone->mobile_number,
-- reporting_manager_employee_number->manager_id, date_joined->join_date,
-- worker_type->employment_type, employment_status->status,
-- pan_number/pan_card_number->personal_id.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS migrate_dim_person_emp_master_columns;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE PROCEDURE migrate_dim_person_emp_master_columns()
BEGIN
  DECLARE CONTINUE HANDLER FOR 1060 BEGIN END;

  ALTER TABLE `dim_person` ADD COLUMN `middle_name` VARCHAR(255) NULL AFTER `first_name`;
  ALTER TABLE `dim_person` ADD COLUMN `date_of_birth` DATE NULL AFTER `display_name`;
  ALTER TABLE `dim_person` ADD COLUMN `gender` VARCHAR(50) NULL AFTER `date_of_birth`;
  ALTER TABLE `dim_person` ADD COLUMN `marital_status` VARCHAR(50) NULL AFTER `gender`;
  ALTER TABLE `dim_person` ADD COLUMN `marriage_date` DATE NULL AFTER `marital_status`;
  ALTER TABLE `dim_person` ADD COLUMN `blood_group` VARCHAR(50) NULL AFTER `marriage_date`;
  ALTER TABLE `dim_person` ADD COLUMN `physically_handicapped` VARCHAR(50) NULL AFTER `blood_group`;
  ALTER TABLE `dim_person` ADD COLUMN `nationality` VARCHAR(100) NULL AFTER `physically_handicapped`;
  ALTER TABLE `dim_person` ADD COLUMN `work_phone` VARCHAR(50) NULL AFTER `mobile_number`;
  ALTER TABLE `dim_person` ADD COLUMN `home_phone` VARCHAR(50) NULL AFTER `work_phone`;
  ALTER TABLE `dim_person` ADD COLUMN `personal_email` VARCHAR(255) NULL AFTER `email`;
  ALTER TABLE `dim_person` ADD COLUMN `current_address_line_1` VARCHAR(255) NULL AFTER `personal_email`;
  ALTER TABLE `dim_person` ADD COLUMN `current_address_line_2` VARCHAR(255) NULL AFTER `current_address_line_1`;
  ALTER TABLE `dim_person` ADD COLUMN `current_address_city` VARCHAR(100) NULL AFTER `current_address_line_2`;
  ALTER TABLE `dim_person` ADD COLUMN `current_address_state` VARCHAR(100) NULL AFTER `current_address_city`;
  ALTER TABLE `dim_person` ADD COLUMN `current_address_zip` VARCHAR(50) NULL AFTER `current_address_state`;
  ALTER TABLE `dim_person` ADD COLUMN `current_address_country` VARCHAR(100) NULL AFTER `current_address_zip`;
  ALTER TABLE `dim_person` ADD COLUMN `permanent_address_line_1` VARCHAR(255) NULL AFTER `current_address_country`;
  ALTER TABLE `dim_person` ADD COLUMN `permanent_address_line_2` VARCHAR(255) NULL AFTER `permanent_address_line_1`;
  ALTER TABLE `dim_person` ADD COLUMN `permanent_address_city` VARCHAR(100) NULL AFTER `permanent_address_line_2`;
  ALTER TABLE `dim_person` ADD COLUMN `permanent_address_state` VARCHAR(100) NULL AFTER `permanent_address_city`;
  ALTER TABLE `dim_person` ADD COLUMN `permanent_address_zip` VARCHAR(50) NULL AFTER `permanent_address_state`;
  ALTER TABLE `dim_person` ADD COLUMN `permanent_address_country` VARCHAR(100) NULL AFTER `permanent_address_zip`;
  ALTER TABLE `dim_person` ADD COLUMN `father_name` VARCHAR(255) NULL AFTER `permanent_address_country`;
  ALTER TABLE `dim_person` ADD COLUMN `mother_name` VARCHAR(255) NULL AFTER `father_name`;
  ALTER TABLE `dim_person` ADD COLUMN `spouse_name` VARCHAR(255) NULL AFTER `mother_name`;
  ALTER TABLE `dim_person` ADD COLUMN `children_names` LONGTEXT NULL AFTER `spouse_name`;
  ALTER TABLE `dim_person` ADD COLUMN `attendance_number` VARCHAR(100) NULL AFTER `children_names`;
  ALTER TABLE `dim_person` ADD COLUMN `location` VARCHAR(100) NULL AFTER `attendance_number`;
  ALTER TABLE `dim_person` ADD COLUMN `location_country` VARCHAR(100) NULL AFTER `location`;
  ALTER TABLE `dim_person` ADD COLUMN `legal_entity` VARCHAR(100) NULL AFTER `location_country`;
  ALTER TABLE `dim_person` ADD COLUMN `business_unit` VARCHAR(100) NULL AFTER `legal_entity`;
  ALTER TABLE `dim_person` ADD COLUMN `department` VARCHAR(100) NULL AFTER `business_unit`;
  ALTER TABLE `dim_person` ADD COLUMN `sub_department` VARCHAR(100) NULL AFTER `department`;
  ALTER TABLE `dim_person` ADD COLUMN `job_title` VARCHAR(255) NULL AFTER `sub_department`;
  ALTER TABLE `dim_person` ADD COLUMN `secondary_job_title` VARCHAR(255) NULL AFTER `job_title`;
  ALTER TABLE `dim_person` ADD COLUMN `reporting_to` VARCHAR(255) NULL AFTER `secondary_job_title`;
  ALTER TABLE `dim_person` ADD COLUMN `dotted_line_manager` VARCHAR(255) NULL AFTER `reporting_to`;
  ALTER TABLE `dim_person` ADD COLUMN `leave_plan` VARCHAR(100) NULL AFTER `dotted_line_manager`;
  ALTER TABLE `dim_person` ADD COLUMN `band` VARCHAR(100) NULL AFTER `leave_plan`;
  ALTER TABLE `dim_person` ADD COLUMN `pay_grade` VARCHAR(100) NULL AFTER `band`;
  ALTER TABLE `dim_person` ADD COLUMN `time_type` VARCHAR(50) NULL AFTER `pay_grade`;
  ALTER TABLE `dim_person` ADD COLUMN `shift_policy_name` VARCHAR(255) NULL AFTER `time_type`;
  ALTER TABLE `dim_person` ADD COLUMN `weekly_off_policy_name` VARCHAR(255) NULL AFTER `shift_policy_name`;
  ALTER TABLE `dim_person` ADD COLUMN `attendance_time_tracking_policy` VARCHAR(255) NULL AFTER `weekly_off_policy_name`;
  ALTER TABLE `dim_person` ADD COLUMN `attendance_capture_scheme` VARCHAR(255) NULL AFTER `attendance_time_tracking_policy`;
  ALTER TABLE `dim_person` ADD COLUMN `holiday_list_name` VARCHAR(255) NULL AFTER `attendance_capture_scheme`;
  ALTER TABLE `dim_person` ADD COLUMN `expense_policy_name` VARCHAR(255) NULL AFTER `holiday_list_name`;
  ALTER TABLE `dim_person` ADD COLUMN `notice_period` VARCHAR(100) NULL AFTER `expense_policy_name`;
  ALTER TABLE `dim_person` ADD COLUMN `aadhaar_number` VARCHAR(64) NULL AFTER `notice_period`;
  ALTER TABLE `dim_person` ADD COLUMN `pf_number` VARCHAR(64) NULL AFTER `aadhaar_number`;
  ALTER TABLE `dim_person` ADD COLUMN `uan_number` VARCHAR(64) NULL AFTER `pf_number`;
  ALTER TABLE `dim_person` ADD COLUMN `comments` LONGTEXT NULL AFTER `uan_number`;
  ALTER TABLE `dim_person` ADD COLUMN `exit_status` VARCHAR(100) NULL AFTER `comments`;
  ALTER TABLE `dim_person` ADD COLUMN `termination_type` VARCHAR(100) NULL AFTER `exit_status`;
  ALTER TABLE `dim_person` ADD COLUMN `termination_reason` LONGTEXT NULL AFTER `termination_type`;
  ALTER TABLE `dim_person` ADD COLUMN `resignation_note` LONGTEXT NULL AFTER `termination_reason`;
  ALTER TABLE `dim_person` ADD COLUMN `cost_center` VARCHAR(100) NULL AFTER `resignation_note`;
END$$
DELIMITER ;

CALL migrate_dim_person_emp_master_columns();
SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS migrate_dim_person_emp_master_columns;
SET sql_notes = IFNULL(@prev_sql_notes, 1);
