SET @has_earliest_joining_date := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rec_candidate_assessment'
    AND COLUMN_NAME = 'earliest_joining_date'
);
SET @add_earliest_joining_date := IF(
  @has_earliest_joining_date = 0,
  'ALTER TABLE rec_candidate_assessment ADD COLUMN earliest_joining_date DATE NULL',
  'SELECT 1'
);
PREPARE stmt FROM @add_earliest_joining_date;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_current_monthly_take_home := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rec_candidate_assessment'
    AND COLUMN_NAME = 'current_monthly_take_home'
);
SET @add_current_monthly_take_home := IF(
  @has_current_monthly_take_home = 0,
  'ALTER TABLE rec_candidate_assessment ADD COLUMN current_monthly_take_home DECIMAL(12,2) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @add_current_monthly_take_home;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
