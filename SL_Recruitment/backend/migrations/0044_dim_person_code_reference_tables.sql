-- Create reference tables for governed person-code allocation.
-- MySQL 8.0.4 compatible and safe to re-run.

USE sl_platform;

CREATE TABLE IF NOT EXISTS `dim_person_code_counter` (
  `code_type` VARCHAR(16) NOT NULL,
  `next_seq` INT NOT NULL,
  `min_seq` INT NOT NULL,
  `max_seq` INT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dim_person_principal_registry` (
  `principal_registry_id` BIGINT NOT NULL AUTO_INCREMENT,
  `canonical_name` VARCHAR(255) NOT NULL,
  `match_name` VARCHAR(255) NOT NULL,
  `match_name_normalized` VARCHAR(255) NOT NULL,
  `active_flag` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`principal_registry_id`),
  UNIQUE KEY `uq_dim_person_principal_registry_match_name_normalized` (`match_name_normalized`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `dim_person_code_counter` (`code_type`, `next_seq`, `min_seq`, `max_seq`, `updated_at`)
VALUES
  ('PRINCIPAL', 1, 1, 10, NOW()),
  ('EMPLOYEE', 11, 11, NULL, NOW()),
  ('INTERN', 1, 1, NULL, NOW()),
  ('CONTRACT', 1, 1, NULL, NOW())
ON DUPLICATE KEY UPDATE
  `updated_at` = `updated_at`;
