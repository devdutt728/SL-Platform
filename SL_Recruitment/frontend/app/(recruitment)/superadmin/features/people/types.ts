export type PersonForm = {
  person_id: string;
  person_code: string;
  personal_id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_number: string;
  role_id: string;
  grade_id: string;
  department_id: string;
  manager_id: string;
  employment_type: string;
  join_date: string;
  exit_date: string;
  status: string;
  is_deleted: string;
  created_at: string;
  updated_at: string;
  source_system: string;
  source_candidate_id: string;
  source_candidate_code: string;
  full_name: string;
  display_name: string;
};

export type BulkResult = {
  mode?: "dry_run" | "apply";
  batch_hash?: string | null;
  total: number;
  processed?: number;
  created: number;
  updated: number;
  skipped: number;
  unchanged?: number;
  conflicts?: number;
  warnings?: { row?: number | null; message: string; person_id?: string | null; person_code?: string | null; email?: string | null }[];
  errors: { row: number; message: string; person_id?: string | null; person_code?: string | null; email?: string | null }[];
};

export const emptyPersonForm: PersonForm = {
  person_id: "",
  person_code: "",
  personal_id: "",
  first_name: "",
  last_name: "",
  email: "",
  mobile_number: "",
  role_id: "",
  grade_id: "",
  department_id: "",
  manager_id: "",
  employment_type: "",
  join_date: "",
  exit_date: "",
  status: "",
  is_deleted: "",
  created_at: "",
  updated_at: "",
  source_system: "",
  source_candidate_id: "",
  source_candidate_code: "",
  full_name: "",
  display_name: "",
};
