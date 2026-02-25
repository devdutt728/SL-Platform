/* Backfill opening filled counts from hired candidates and auto-close fully filled openings. */

SET time_zone = '+00:00';

UPDATE rec_opening ro
LEFT JOIN (
  SELECT
    rc.applied_opening_id AS opening_id,
    COUNT(*) AS hired_count
  FROM rec_candidate rc
  WHERE rc.applied_opening_id IS NOT NULL
    AND rc.final_decision = 'hired'
    AND rc.archived_at IS NULL
  GROUP BY rc.applied_opening_id
) hired ON hired.opening_id = ro.opening_id
SET
  ro.headcount_filled = COALESCE(hired.hired_count, 0),
  ro.is_active = CASE
    WHEN COALESCE(ro.headcount_required, 0) > 0
      AND COALESCE(hired.hired_count, 0) >= COALESCE(ro.headcount_required, 0)
    THEN 0
    ELSE ro.is_active
  END,
  ro.updated_at = UTC_TIMESTAMP();
