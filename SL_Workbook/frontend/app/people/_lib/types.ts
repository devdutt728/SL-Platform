export type EmploymentStatus = "working" | "relieved" | "terminated";

export interface EmployeeListItem {
  id: string;
  employee_number: string;
  person_id: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  mobile_number: string | null;
  employment_status: EmploymentStatus;
  worker_type: string;
  department: string | null;
  sub_department: string | null;
  business_unit: string | null;
  job_title: string | null;
  date_joined: string | null;
  exit_date: string | null;
}

export interface EmployeeListResponse {
  items: EmployeeListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AddressBlock {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

export interface EmployeeProfile {
  id: string;
  identity: {
    person_id: string | null;
    person_code: string | null;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    display_name: string | null;
    email: string | null;
    mobile_number: string | null;
    platform_status: string | null;
  };
  ext: {
    employee_number: string;
    legacy_number: string | null;
    attendance_number: string | null;
    employment_status: EmploymentStatus;
    worker_type: string;
    time_type: string;
  };
  personal: Record<string, string | boolean | null>;
  address: { current: AddressBlock; permanent: AddressBlock };
  work_info: Record<string, string | null>;
  policy: Record<string, string | null>;
  exit: Record<string, string | null>;
  compliance: { pan: string | null; aadhaar: string | null; pf_number: string | null; uan_number: string | null } | null;
  compliance_available: boolean;
}

export interface AuditLogItem {
  id: string;
  section: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  performed_by_person_id: string;
  performed_at: string;
  ip_address: string | null;
}

export interface AuditLogResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
}

export interface MeResponse {
  person_id: string | null;
  person_code: string | null;
  email: string;
  name: string | null;
  access_level: "view" | "edit" | "admin";
}

export type LicenseHolderKind = "person" | "shared" | "unassigned";

export interface LicenseAssignmentItem {
  id: string;
  work_email: string;
  tool_name: string;
  tool_short_name: string | null;
  plan: string | null;
  status: string;
  assigned_on: string | null;
  renewal_date: string | null;
  cost_centre: string | null;
  notes: string | null;
  holder_kind: LicenseHolderKind;
  holder_name: string | null;
  updated_at: string | null;
}

export interface LicenseAssignmentListResponse {
  items: LicenseAssignmentItem[];
  total: number;
  page: number;
  limit: number;
}

export interface LicenseContractItem {
  id: string;
  contract_key: string;
  entity: string | null;
  software: string;
  short_name: string | null;
  category: string | null;
  contract_no: string | null;
  contract_type: string | null;
  serial_no: string | null;
  seats: number;
  vendor: string | null;
  start_date: string | null;
  end_date: string | null;
  cost: number | null;
  currency: string;
  status: string | null;
  user_type: string | null;
  notes: string | null;
  days_to_expiry: number | null;
  renewal_status: string;
  updated_at: string | null;
}

export interface LicenseContractListResponse {
  items: LicenseContractItem[];
  total: number;
  page: number;
  limit: number;
}

export interface LicenseSoftwareSummary {
  software: string;
  short_name: string;
  category: string | null;
  purchased: number;
  assigned: number;
  shared_assigned: number;
  total_assigned: number;
  contracts: number;
}

export interface LicenseEmailIssue {
  email: string;
  tools: string[];
  known: boolean;
}

export interface LicenseSummaryResponse {
  totals: {
    purchased: number;
    assigned: number;
    shared_assigned: number;
    total_assigned: number;
    software_titles: number;
  };
  software_summaries: LicenseSoftwareSummary[];
  expiring_soon_list: LicenseContractItem[];
  all_contracts: LicenseContractItem[];
  total_assignments: number;
  shared_email_list: LicenseEmailIssue[];
  unknown_email_list: LicenseEmailIssue[];
}

export interface SystemInventoryItem {
  id: string;
  system_id: string;
  system_type: string | null;
  assigned_email: string | null;
  user_display: string | null;
  team: string | null;
  processor: string | null;
  ram_gb: number | null;
  ram_slots_free: string | null;
  graphics_card: string | null;
  cpu_cores: string | null;
  storage: string | null;
  motherboard: string | null;
  os: string | null;
  autocad_version: string | null;
  sketchup_version: string | null;
  threedmax_version: string | null;
  rhino_version: string | null;
  enscape_version: string | null;
  d5_render: string | null;
  adobe_versions: string | null;
  office_version: string | null;
  antivirus: string | null;
  purchase_date: string | null;
  vendor: string | null;
  service_tag: string | null;
  serial_no: string | null;
  composite_score: number | null;
  capability_tier: string | null;
  upgrade_suggestion: string | null;
  status: string;
  notes: string | null;
  updated_at: string | null;
}

export interface SystemInventoryListResponse {
  items: SystemInventoryItem[];
  total: number;
  tier_counts: Record<string, number>;
  page: number;
  limit: number;
}

export interface PersonLookupItem {
  email: string;
  name: string;
  employee_no: string | null;
  team: string | null;
  title: string | null;
}

export interface PersonLookupResponse {
  items: PersonLookupItem[];
}

export interface SystemGradePreviewResponse {
  cpu_score: number;
  gpu_score: number;
  ram_score: number;
  ram_gb: number;
  score: number;
  tier: string;
  capability: string;
  suggestion: string;
}

export interface PeripheralInventoryItem {
  id: string;
  item_id: string;
  category: string | null;
  item: string;
  model: string | null;
  serial: string | null;
  quantity: number;
  condition: string | null;
  location: string | null;
  assigned_to: string | null;
  status: string;
  notes: string | null;
  updated_at: string | null;
}

export interface PeripheralInventoryListResponse {
  items: PeripheralInventoryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface GroupMemberSystem {
  system_id: string;
  tier: string | null;
  grade_score: number | null;
  processor: string | null;
  ram_gb: number | null;
  gpu: string | null;
  upgrade_suggestion: string | null;
  status: string;
  autocad_version: string | null;
  sketchup_version: string | null;
  threedmax_version: string | null;
  rhino_version: string | null;
  enscape_version: string | null;
  d5_render: string | null;
  adobe_versions: string | null;
  office_version: string | null;
}

export interface GroupMemberOverview {
  employee_no: string;
  name: string;
  email: string | null;
  title: string | null;
  designation_level: string | null;
  designation_color: string | null;
  licence_count: number;
  licences: string[];
  system: GroupMemberSystem | null;
}

export interface GroupOverviewItem {
  key: string;
  name: string;
  principal: string;
  team_lead: string | null;
  headcount: number;
  system_count: number;
  system_ids: string[];
  tool_counts: Record<string, number>;
  tier_counts: Record<string, number>;
  total_licences: number;
  members: GroupMemberOverview[];
  color: string | null;
}

export interface GroupOverviewResponse {
  items: GroupOverviewItem[];
  tools: string[];
  tiers: string[];
}
