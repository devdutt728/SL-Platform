-- Backfill explicit app grants for Recruitment and Project Planner.
-- Safe to re-run: INSERT IGNORE preserves existing assignments.

INSERT IGNORE INTO sl_platform.dim_person_feature_access (
  person_id,
  feature_code,
  granted_at,
  granted_by_person_id
)
SELECT
  dp.person_id,
  'recruitment_app',
  NOW(),
  NULL
FROM sl_platform.dim_person dp
LEFT JOIN sl_platform.dim_role dr
  ON dr.role_id = dp.role_id
WHERE COALESCE(dp.is_deleted, 0) = 0
  AND (
    dp.status IS NULL
    OR LOWER(dp.status) IN ('working', 'active')
  )
  AND (
    dp.role_id = 2
    OR LOWER(COALESCE(dr.role_code, '')) IN ('hr_admin', 'hr_exec', 'interviewer', 'gl', 'group_lead', 'hiring_manager', 'approver', 'superadmin', 's_admin', 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM sl_platform.dim_person_role dpr
      JOIN sl_platform.dim_role drr ON drr.role_id = dpr.role_id
      WHERE dpr.person_id = dp.person_id
        AND LOWER(COALESCE(drr.role_code, '')) IN ('hr_admin', 'hr_exec', 'interviewer', 'gl', 'group_lead', 'hiring_manager', 'approver', 'superadmin', 's_admin', 'super_admin')
    )
  );

INSERT IGNORE INTO sl_platform.dim_person_feature_access (
  person_id,
  feature_code,
  granted_at,
  granted_by_person_id
)
SELECT
  dp.person_id,
  'planner_app',
  NOW(),
  NULL
FROM sl_platform.dim_person dp
LEFT JOIN sl_platform.dim_role dr
  ON dr.role_id = dp.role_id
WHERE COALESCE(dp.is_deleted, 0) = 0
  AND (
    dp.status IS NULL
    OR LOWER(dp.status) IN ('working', 'active')
  )
  AND (
    dp.role_id = 2
    OR LOWER(COALESCE(dr.role_code, '')) IN ('superadmin', 's_admin', 'super_admin', 'gl', 'group_lead', 'project_anchor')
    OR EXISTS (
      SELECT 1
      FROM sl_platform.dim_person_role dpr
      JOIN sl_platform.dim_role drr ON drr.role_id = dpr.role_id
      WHERE dpr.person_id = dp.person_id
        AND LOWER(COALESCE(drr.role_code, '')) IN ('superadmin', 's_admin', 'super_admin', 'gl', 'group_lead', 'project_anchor')
    )
    OR LOWER(CONCAT_WS(' ',
      COALESCE(dp.job_title, ''),
      COALESCE(dp.secondary_job_title, ''),
      COALESCE(dp.department, ''),
      COALESCE(dp.sub_department, '')
    )) LIKE '%principal%'
    OR LOWER(CONCAT_WS(' ',
      COALESCE(dp.job_title, ''),
      COALESCE(dp.secondary_job_title, ''),
      COALESCE(dp.department, ''),
      COALESCE(dp.sub_department, '')
    )) LIKE '%group leader%'
    OR LOWER(CONCAT_WS(' ',
      COALESCE(dp.job_title, ''),
      COALESCE(dp.secondary_job_title, ''),
      COALESCE(dp.department, ''),
      COALESCE(dp.sub_department, '')
    )) LIKE '%project anchor%'
    OR LOWER(CONCAT_WS(' ',
      COALESCE(dp.job_title, ''),
      COALESCE(dp.secondary_job_title, ''),
      COALESCE(dp.department, ''),
      COALESCE(dp.sub_department, '')
    )) LIKE '%senior architect%'
    OR LOWER(CONCAT_WS(' ',
      COALESCE(dp.job_title, ''),
      COALESCE(dp.secondary_job_title, ''),
      COALESCE(dp.department, ''),
      COALESCE(dp.sub_department, '')
    )) LIKE '%sr architect%'
    OR LOWER(CONCAT_WS(' ',
      COALESCE(dp.job_title, ''),
      COALESCE(dp.secondary_job_title, ''),
      COALESCE(dp.department, ''),
      COALESCE(dp.sub_department, '')
    )) LIKE '%architect%'
    OR LOWER(CONCAT_WS(' ',
      COALESCE(dp.job_title, ''),
      COALESCE(dp.secondary_job_title, ''),
      COALESCE(dp.department, ''),
      COALESCE(dp.sub_department, '')
    )) LIKE '%designer%'
    OR LOWER(CONCAT_WS(' ',
      COALESCE(dp.job_title, ''),
      COALESCE(dp.secondary_job_title, ''),
      COALESCE(dp.department, ''),
      COALESCE(dp.sub_department, '')
    )) LIKE '%interior designer%'
  );
