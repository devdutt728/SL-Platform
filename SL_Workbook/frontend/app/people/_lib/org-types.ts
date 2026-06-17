export interface OrgPerson {
  employee_no: string;
  name: string;
  email: string | null;
  title: string | null;
  mobile_number: string | null;
  department: string | null;
  sub_department: string | null;
  business_unit: string | null;
  group_key: string;
  group_name: string;
  principal: string;
  org_level: string | null;
  designation_level: string | null;
  designation_color: string | null;
  designation_order: number | null;
  sl_exp_years: number | null;
  o_exp_years: number | null;
  prior_exp_years: number | null;
  sl_exp_display: string;
  o_exp_display: string;
  license_count: number;
  image_url: string | null;
  source_manager_emp: string | null;
  manager_override_emp: string | null;
  include_in_org: boolean;
}

export interface OrgGroupNode {
  key: string;
  name: string;
  principal: string;
  lead_name: string | null;
  lead: OrgPerson | null;
  color: string | null;
  sort: number;
  members: OrgPerson[];
}

export interface OrgPrincipalNode {
  name: string;
  color: string;
  employee_no: string | null;
  employee_count: number;
  group_count: number;
  groups: OrgGroupNode[];
}

export interface OrgLive {
  principals: OrgPrincipalNode[];
  generated_at: string;
  source: "snapshot" | "live";
  last_log_id: string | null;
}

export interface GroupInfo {
  group_key: string;
  name: string;
  principal_name: string;
  team_lead_emp: string | null;
  parent_name: string | null;
  color_hex: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface DraftMove {
  empNo: string;
  name: string;
  fromGroupKey: string | null;
  fromPrincipal: string | null;
  toGroupKey: string;
  toPrincipal: string | null;
}

export interface DraftState {
  slot_number: number;
  draft_name: string | null;
  moves_count: number;
  status: "empty" | "active" | "archived";
  updated_by: string | null;
  updated_at: string | null;
}

export interface ChangeLogItem {
  id: string;
  action: string;
  performed_by_person_id: string;
  performed_at: string;
  draft_name: string | null;
  changes_count: number;
}

export interface ChangeLogList {
  items: ChangeLogItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ChangeLogDetail {
  id: string;
  action: string;
  performed_by_person_id: string;
  performed_at: string;
  draft_name: string | null;
  diff_summary: DraftMove[];
  snapshot_after: { principals: OrgPrincipalNode[] };
}
