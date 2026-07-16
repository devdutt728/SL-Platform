-- Canonical role list (single upsert for all roles)
-- Adjust role_id values if you need to preserve existing IDs.
--
-- NOTE: IDs 12-17 are owned by the Planner module and are intentionally NOT
-- listed here (this seed only manages platform + IMS roles). IDs 9-11 were the
-- retired IT-helpdesk roles (it_admin/it_lead/it_agent) and are repurposed as
-- the fresh IMS roles; ims_viewer is added as id 18.

INSERT INTO sl_platform.dim_role (role_id, role_code, role_name)
VALUES
  (1,  'user',            'Employee'),
  (2,  's_admin',         'Superadmin'),
  (3,  'hr_admin',        'HR Admin'),
  (4,  'hr_exec',         'HR Executive'),
  (5,  'hiring_manager',  'Hiring Manager'),
  (6,  'interviewer',     'Interviewer'),
  (7,  'approver',        'Approver'),
  (8,  'viewer',          'Viewer'),
  (9,  'ims_admin',       'IMS Admin'),
  (10, 'ims_manager',     'IT Manager'),
  (11, 'ims_operator',    'IT Staff'),
  (18, 'ims_viewer',      'IMS Viewer')
ON DUPLICATE KEY UPDATE
  role_code = VALUES(role_code),
  role_name = VALUES(role_name);
