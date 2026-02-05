-- Add L2/GL owner fields to rec_candidate (MySQL)
ALTER TABLE rec_candidate
  ADD COLUMN l2_owner_email VARCHAR(255) NULL AFTER hired_person_id_platform,
  ADD COLUMN l2_owner_name VARCHAR(200) NULL AFTER l2_owner_email;
