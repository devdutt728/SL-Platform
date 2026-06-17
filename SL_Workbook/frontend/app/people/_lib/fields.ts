import type { FieldDef } from "../_components/Field";

export const IDENTITY_FIELDS: FieldDef[] = [
  { key: "full_name", label: "Full Name" },
  { key: "display_name", label: "Display Name" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "mobile_number", label: "Mobile" },
];

export const PERSONAL_FIELDS: FieldDef[] = [
  { key: "middle_name", label: "Middle Name" },
  { key: "personal_email", label: "Personal Email" },
  { key: "work_phone", label: "Work Phone" },
  { key: "home_phone", label: "Home Phone" },
  { key: "date_of_birth", label: "Date of Birth", type: "date" },
  { key: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Other", "Prefer not to respon"] },
  { key: "marital_status", label: "Marital Status", type: "select", options: ["Single", "Married", "Divorced", "Widowed"] },
  { key: "marriage_date", label: "Marriage Date", type: "date" },
  {
    key: "blood_group",
    label: "Blood Group",
    type: "select",
    options: [
      "A+ (A Positive)",
      "A- (A Negative)",
      "B+ (B Positive)",
      "B- (B Negative)",
      "O+ (O Positive)",
      "O- (O Negative)",
      "AB+ (AB Positive)",
      "AB- (AB Negative)",
    ],
  },
  { key: "physically_handicapped", label: "Physically Handicapped", type: "bool" },
  { key: "nationality", label: "Nationality" },
  { key: "father_name", label: "Father's Name" },
  { key: "mother_name", label: "Mother's Name" },
  { key: "spouse_name", label: "Spouse's Name" },
  { key: "children_names", label: "Children" },
];

export const WORK_FIELDS: FieldDef[] = [
  { key: "department", label: "Department" },
  { key: "sub_department", label: "Sub Department" },
  { key: "business_unit", label: "Business Unit" },
  { key: "job_title", label: "Job Title" },
  { key: "secondary_job_title", label: "Secondary Job Title" },
  { key: "reporting_manager_number", label: "Reporting Manager (Emp #)" },
  { key: "location", label: "Location" },
  { key: "location_country", label: "Location Country" },
  { key: "legal_entity", label: "Legal Entity" },
  { key: "date_joined", label: "Date Joined", type: "date" },
  { key: "notice_period", label: "Notice Period" },
  { key: "band", label: "Band" },
  { key: "pay_grade", label: "Pay Grade" },
  { key: "cost_center", label: "Cost Center" },
];

export const ADDRESS_FIELDS: FieldDef[] = [
  { key: "line1", label: "Line 1" },
  { key: "line2", label: "Line 2" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip" },
  { key: "country", label: "Country" },
];

export const POLICY_FIELDS: FieldDef[] = [
  { key: "leave_plan", label: "Leave Plan" },
  { key: "shift_policy", label: "Shift Policy" },
  { key: "weekly_off_policy", label: "Weekly Off Policy" },
  { key: "attendance_tracking_policy", label: "Attendance Tracking" },
  { key: "attendance_capture_scheme", label: "Attendance Capture" },
  { key: "holiday_list", label: "Holiday List" },
  { key: "expense_policy", label: "Expense Policy" },
];

export const COMPLIANCE_FIELDS: FieldDef[] = [
  { key: "pan", label: "PAN Number" },
  { key: "aadhaar", label: "Aadhaar Number" },
  { key: "pf_number", label: "PF Number" },
  { key: "uan_number", label: "UAN Number" },
];

export const EXIT_FIELDS: FieldDef[] = [
  { key: "exit_status", label: "Exit Status", type: "select", options: ["In Progress", "Completed"] },
  { key: "termination_type", label: "Termination Type" },
  { key: "termination_reason", label: "Termination Reason" },
  { key: "resignation_note", label: "Resignation Note" },
  { key: "comments", label: "Comments" },
];
