export type User = {
  user_id: string;
  email: string;
  roles: string[];
  person_id_platform?: string | null;
  full_name?: string | null;
  platform_role_id?: number | null;
  platform_role_code?: string | null;
  platform_role_name?: string | null;
};

export type PlatformUser = {
  person_id: string;
  email?: string | null;
  full_name: string;
  role_id?: number | null;
  role_code?: string | null;
  role_name?: string | null;
  status?: string | null;
  is_deleted?: number | null;
};

export type PlatformRole = {
  role_id: number;
  role_code?: string | null;
  role_name?: string | null;
};

export type Ticket = {
  ticket_id: number;
  ticket_number: string;
  subject: string;
  description?: string;
  priority: string;
  impact: string;
  urgency: string;
  status: string;
  requester_person_id: string;
  requester_email: string;
  requester_name: string;
  assignee_person_id?: string | null;
  assignee_email?: string | null;
  assignee_name?: string | null;
  created_at: string;
  updated_at?: string;
};

export type Category = {
  category_id: number;
  name: string;
  is_active: boolean;
};

export type Subcategory = {
  subcategory_id: number;
  category_id: number;
  name: string;
  is_active: boolean;
};
