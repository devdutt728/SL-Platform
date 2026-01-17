-- Canonical role list (single upsert for all roles)
-- Adjust role_id values if you need to preserve existing IDs.

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
  (9,  'it_admin',        'IT Admin'),
  (10, 'it_lead',         'IT Lead'),
  (11, 'it_agent',        'IT Agent')
ON DUPLICATE KEY UPDATE
  role_code = VALUES(role_code),
  role_name = VALUES(role_name);
