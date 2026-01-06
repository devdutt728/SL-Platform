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

export type Asset = {
  asset_id: number;
  asset_tag: string;
  asset_type: string;
  status: string;
  serial_number?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  operating_system?: string | null;
  purchase_date?: string | null;
  warranty_end?: string | null;
  location?: string | null;
  assigned_person_id?: string | null;
  assigned_email?: string | null;
  assigned_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type Vendor = {
  vendor_id: number;
  name: string;
  website?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type License = {
  license_id: number;
  vendor_id?: number | null;
  name: string;
  sku?: string | null;
  license_type: string;
  billing_cycle: string;
  total_seats: number;
  contract_start?: string | null;
  contract_end?: string | null;
  renewal_date?: string | null;
  registered_email?: string | null;
  cost_currency: string;
  cost_amount?: number | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LicenseAssignment = {
  assignment_id: number;
  license_id: number;
  asset_id?: number | null;
  assignee_person_id?: string | null;
  assignee_email?: string | null;
  assignee_name?: string | null;
  assigned_at: string;
  unassigned_at?: string | null;
  status?: string | null;
  notes?: string | null;
  created_at: string;
};
