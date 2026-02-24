/* Add HR-visible request detail columns for Opening request workflow (idempotent, one-go). */

DROP PROCEDURE IF EXISTS tmp_add_rec_opening_request_hr_cols;

DELIMITER $$

CREATE PROCEDURE tmp_add_rec_opening_request_hr_cols()
BEGIN
  /* hiring_manager_email */
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'rec_opening_request'
      AND column_name = 'hiring_manager_email'
  ) THEN
    ALTER TABLE rec_opening_request
      ADD COLUMN hiring_manager_email VARCHAR(255) NULL
      AFTER hiring_manager_person_id_platform;
  END IF;

  /* gl_details */
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'rec_opening_request'
      AND column_name = 'gl_details'
  ) THEN
    ALTER TABLE rec_opening_request
      ADD COLUMN gl_details VARCHAR(255) NULL
      AFTER hiring_manager_email;
  END IF;

  /* l2_details */
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'rec_opening_request'
      AND column_name = 'l2_details'
  ) THEN
    ALTER TABLE rec_opening_request
      ADD COLUMN l2_details VARCHAR(255) NULL
      AFTER gl_details;
  END IF;
END$$

DELIMITER ;

CALL tmp_add_rec_opening_request_hr_cols();

DROP PROCEDURE IF EXISTS tmp_add_rec_opening_request_hr_cols;