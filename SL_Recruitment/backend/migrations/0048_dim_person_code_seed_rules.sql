-- Seed principal registry and special-case rules for governed person-code allocation.
-- MySQL 8.0.4 compatible and safe to re-run.

USE sl_platform;

INSERT INTO `dim_person_principal_registry` (
  `canonical_name`,
  `match_name`,
  `match_name_normalized`,
  `active_flag`
)
VALUES
  ('Ambrish Arora', 'Ambrish Arora', 'ambrish arora', 1),
  ('Sidhartha Talwar', 'Sidhartha Talwar', 'sidhartha talwar', 1),
  ('Ankur Choksi', 'Ankur Choksi', 'ankur choksi', 1),
  ('Ankur Choksi', 'Ankur Pradeep Choksi', 'ankur pradeep choksi', 1),
  ('Pankhuri Goel', 'Pankhuri Goel', 'pankhuri goel', 1),
  ('Asha Sairam', 'Asha Sairam', 'asha sairam', 1),
  ('Harsh Vardhan', 'Harsh', 'harsh', 1),
  ('Harsh Vardhan', 'Harsh Vardhan', 'harsh vardhan', 1)
ON DUPLICATE KEY UPDATE
  `canonical_name` = VALUES(`canonical_name`),
  `match_name` = VALUES(`match_name`),
  `active_flag` = VALUES(`active_flag`),
  `updated_at` = NOW();

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP PROCEDURE IF EXISTS sp_dim_person_seed_principal_flags;
DROP PROCEDURE IF EXISTS sp_dim_person_apply_special_cases;
SET sql_notes = IFNULL(@prev_sql_notes, 1);

DELIMITER $$
CREATE PROCEDURE sp_dim_person_seed_principal_flags()
BEGIN
  UPDATE `dim_person` p
  SET p.`principal_flag` = CASE
      WHEN EXISTS (
        SELECT 1
        FROM `dim_person_principal_registry` r
        WHERE r.`active_flag` = 1
          AND r.`match_name_normalized` = fn_dim_person_normalize_name(
            COALESCE(
              NULLIF(TRIM(p.`display_name`), ''),
              NULLIF(TRIM(p.`full_name`), ''),
              NULLIF(TRIM(CONCAT_WS(' ', p.`first_name`, p.`last_name`)), '')
            )
          )
      ) THEN 1
      ELSE 0
    END;
END$$

CREATE PROCEDURE sp_dim_person_apply_special_cases()
BEGIN
  DECLARE v_devdutt_person_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_sl343_taken INT DEFAULT 0;

  SELECT p.`person_id`
  INTO v_devdutt_person_id
  FROM `dim_person` p
  WHERE fn_dim_person_normalize_name(
          COALESCE(
            NULLIF(TRIM(p.`display_name`), ''),
            NULLIF(TRIM(p.`full_name`), ''),
            NULLIF(TRIM(CONCAT_WS(' ', p.`first_name`, p.`last_name`)), '')
          )
        ) = 'devdutt kumar'
    AND IFNULL(p.`principal_flag`, 0) = 0
  ORDER BY CASE WHEN p.`join_date` IS NULL THEN 1 ELSE 0 END, p.`join_date`, p.`person_id`
  LIMIT 1;

  IF v_devdutt_person_id IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_sl343_taken
    FROM `dim_person`
    WHERE UPPER(TRIM(COALESCE(`person_code`, ''))) = 'SL343'
       OR (
         UPPER(TRIM(COALESCE(`reserved_person_code`, ''))) = 'SL343'
         AND `person_id` COLLATE utf8mb4_unicode_ci <> v_devdutt_person_id COLLATE utf8mb4_unicode_ci
       );

    UPDATE `dim_person`
    SET `reserved_person_code` = CASE WHEN v_sl343_taken = 0 THEN 'SL343' ELSE NULL END,
        `special_digit_root` = CASE WHEN v_sl343_taken = 0 THEN NULL ELSE 1 END
    WHERE `person_id` = v_devdutt_person_id;
  END IF;
END$$
DELIMITER ;
