-- Disable automatic dim_person.person_code rewrites.
-- Bulk people imports should persist the uploaded person_code value as-is.

USE sl_platform;

SET @prev_sql_notes := @@sql_notes;
SET sql_notes = 0;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bi;
DROP TRIGGER IF EXISTS trg_dim_person_person_code_bu;
SET sql_notes = IFNULL(@prev_sql_notes, 1);
