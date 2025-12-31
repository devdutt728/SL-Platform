-- Phase 3C: Store requested_by as platform string person_id (e.g. DK_0498)
-- sl_platform.dim_person.person_id is VARCHAR(64); align rec_opening.reporting_person_id_platform accordingly.

ALTER TABLE rec_opening
  MODIFY COLUMN reporting_person_id_platform VARCHAR(64) NULL;

