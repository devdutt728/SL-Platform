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
  role_ids?: number[] | null;
  role_codes?: string[] | null;
  role_names?: string[] | null;
  status?: string | null;
  is_deleted?: number | null;
};

export type PlatformRole = {
  role_id: number;
  role_code?: string | null;
  role_name?: string | null;
};

// ── IMS inventory ─────────────────────────────────────────────────────────────
export type Category = {
  category_id: number;
  name: string;
  code: string;
  item_kind: string;
  default_warranty_months?: number | null;
  default_depreciation_rate?: number | null;
  default_useful_life_years?: number | null;
  sort_order: number;
  is_active: boolean;
};

export type Manufacturer = { manufacturer_id: number; name: string; is_active: boolean };

export type Vendor = {
  vendor_id: number;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  address?: string | null;
  is_active: boolean;
};

export type Location = {
  location_id: number;
  name: string;
  parent_id?: number | null;
  kind: string;
  is_active: boolean;
};

export type Product = {
  product_id: number;
  category_id: number;
  category_name?: string | null;
  manufacturer_id?: number | null;
  manufacturer_name?: string | null;
  model_name: string;
  specs?: Record<string, unknown> | null;
  default_warranty_months?: number | null;
  default_useful_life_years?: number | null;
  is_active: boolean;
};

export type Asset = {
  asset_id: number;
  asset_tag: string;
  serial_number?: string | null;
  category_id: number;
  category_name?: string | null;
  category_code?: string | null;
  product_id?: number | null;
  manufacturer_id?: number | null;
  manufacturer_name?: string | null;
  model_name?: string | null;
  status: string;
  condition_rating: string;
  location_id?: number | null;
  location_name?: string | null;
  assigned_person_id?: string | null;
  assigned_email?: string | null;
  assigned_name?: string | null;
  vendor_id?: number | null;
  vendor_name?: string | null;
  purchase_cost?: number | null;
  currency: string;
  purchase_date?: string | null;
  warranty_start?: string | null;
  warranty_end?: string | null;
  in_service_date?: string | null;
  retirement_date?: string | null;
  useful_life_years?: number | null;
  specs?: Record<string, unknown> | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  warranty_status?: string | null;
  warranty_days_left?: number | null;
  age_years?: number | null;
  current_book_value?: number | null;
  qr_payload?: string | null;
};

export type AssetListResponse = { items: Asset[]; total: number; page: number; limit: number };

export type AssetImportRow = {
  row_number: number;
  action: "CREATE" | "UPDATE" | "UNCHANGED" | "ERROR";
  asset_tag?: string | null;
  changes: Record<string, [string | null, string | null]>;
  error?: string | null;
};

export type AssetImportResult = {
  rows: AssetImportRow[];
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
};
export type NextTag = { category_id: number; category_code: string; fy: number; next_tag: string };
export type ImsMeta = {
  asset_statuses: string[];
  conditions: string[];
  item_kinds: string[];
  location_kinds: string[];
  assignment_actions?: string[];
  repair_statuses?: string[];
  repair_outcomes?: string[];
  license_billing_cycles?: string[];
  consumable_directions?: string[];
  attachment_kinds?: string[];
};

export type Assignment = {
  assignment_id: number;
  asset_id: number;
  asset_tag?: string | null;
  action: string;
  person_email?: string | null;
  person_name?: string | null;
  from_location_id?: number | null;
  to_location_id?: number | null;
  assigned_at: string;
  returned_at?: string | null;
  condition_out?: string | null;
  condition_in?: string | null;
  handover_doc_url?: string | null;
  acknowledged_at?: string | null;
  notes?: string | null;
};

export type Purchase = {
  purchase_id: number;
  vendor_id?: number | null;
  vendor_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  currency: string;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  invoice_file_url?: string | null;
  created_at?: string | null;
};

export type Repair = {
  repair_id: number;
  asset_id: number;
  asset_tag?: string | null;
  reported_fault: string;
  vendor_id?: number | null;
  vendor_name?: string | null;
  sent_at: string;
  expected_return_at?: string | null;
  returned_at?: string | null;
  status: string;
  outcome?: string | null;
  warranty_covered: boolean;
  estimated_cost?: number | null;
  final_cost?: number | null;
  loaner_asset_id?: number | null;
};

export type License = {
  license_id: number;
  name: string;
  vendor_id?: number | null;
  vendor_name?: string | null;
  license_type?: string | null;
  billing_cycle: string;
  total_seats: number;
  assigned_seats: number;
  cost?: number | null;
  currency: string;
  renewal_date?: string | null;
  registered_email?: string | null;
  is_active: boolean;
};

export type Consumable = {
  consumable_id: number;
  name: string;
  category_id?: number | null;
  category_name?: string | null;
  unit: string;
  current_qty: number;
  min_qty: number;
  location_id?: number | null;
  location_name?: string | null;
  low_stock: boolean;
};

export type Alert = {
  alert_id?: number | null;
  alert_type: string;
  entity_type: string;
  entity_id: number;
  title: string;
  due_date?: string | null;
  status: string;
  severity: string;
  metadata_json?: Record<string, unknown> | null;
};

export type FinanceSummary = {
  fy: number;
  actual_total: number;
  forecast_total: number;
  budget_total: number;
  variance: number;
  monthly_actuals: Array<{ month: number; amount: number }>;
  by_cost_type: Array<{ name: string; amount: number }>;
  by_category: Array<{ name: string; amount: number }>;
  five_year_projection: Array<{ fy: number; hardware: number; software: number; total: number }>;
};

export type CostEvent = {
  fy: number;
  month: number;
  cost_type: string;
  source: string;
  category_name?: string | null;
  vendor_name?: string | null;
  amount: number;
  currency: string;
  event_date: string;
  description?: string | null;
};

export type DashboardSummary = {
  kpis: Record<string, number>;
  status_counts: Array<{ name: string; count: number }>;
  category_mix: Array<{ name: string; count: number }>;
  warranty_breakdown: Array<{ name: string; count: number }>;
  allotment: Record<string, number>;
  repair: Record<string, number>;
  license: Record<string, number>;
  consumables: Record<string, number>;
  alerts: Alert[];
};

export type PersonRef = {
  person_id?: string | null;
  email?: string | null;
  full_name?: string | null;
};

export type LicenseSeat = {
  seat_id: number;
  license_id: number;
  person_id?: string | null;
  person_email?: string | null;
  person_name?: string | null;
  asset_id?: number | null;
  assigned_at: string;
  released_at?: string | null;
  notes?: string | null;
};
