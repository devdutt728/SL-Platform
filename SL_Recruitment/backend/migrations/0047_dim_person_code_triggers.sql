-- Triggers for governed dim_person person-code allocation.
-- MySQL 8.0.4 compatible.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bi;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bu;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE TRIGGER trg_dim_person_person_code_bi
BEFORE INSERT ON `dim_person`
FOR EACH ROW FOLLOWS dim_person_bi
BEGIN
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
    SET NEW.`person_code` = UPPER(TRIM(NEW.`person_code`));
  END IF;
END$$

CREATE TRIGGER trg_dim_person_person_code_bu
BEFORE UPDATE ON `dim_person`
FOR EACH ROW
BEGIN
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
    SET NEW.`person_code` = UPPER(TRIM(NEW.`person_code`));
  END IF;
END$$
DELIMITER ;
