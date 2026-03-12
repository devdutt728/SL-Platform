"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { JoiningProfile } from "@/lib/types";

export type CandidateConvertFormState = {
  person_code: string;
  personal_id: string;
  aadhaar_number: string;
  pan_verified: boolean;
  aadhaar_verified: boolean;
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
  source_system: string;
  full_name: string;
  display_name: string;
};

type Props = {
  open: boolean;
  busy: boolean;
  error: string | null;
  requiresStudioLotusDomain: boolean;
  form: CandidateConvertFormState;
  joiningProfile?: JoiningProfile | null;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (patch: Partial<CandidateConvertFormState>) => void;
};

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text",
  disabled = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "email" | "date";
  disabled?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="space-y-1 text-xs text-slate-600">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
      />
    </label>
  );
}

export function Candidate360ConvertDialog({
  open,
  busy,
  error,
  requiresStudioLotusDomain,
  form,
  joiningProfile,
  onClose,
  onSubmit,
  onChange,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[370] overflow-y-auto bg-black/35 px-4 py-6" role="dialog" aria-modal="true">
      <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center">
        <div className="max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.55)]">
        <p className="text-lg font-semibold text-slate-900">Mark Candidate As Joined</p>
        <p className="mt-1 text-sm text-slate-600">
          HR can review and edit all employee details before pushing to `dim_person`.
        </p>
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {requiresStudioLotusDomain
            ? "Permanent role detected: email must end with @studiolotus.in."
            : "Intern/non-permanent role detected: any valid email is allowed."}
        </p>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">Candidate joining profile</p>
          <p className="mt-1">
            Status: <span className="font-medium text-slate-900">{joiningProfile?.profile_status || "not submitted"}</span>
          </p>
          <p className="mt-1">
            Submitted at: <span className="font-medium text-slate-900">{joiningProfile?.submitted_at ? new Date(joiningProfile.submitted_at).toLocaleString() : "-"}</span>
          </p>
          <p className="mt-1">
            HR must verify PAN and Aadhaar before final hire.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <TextInput
            label="Employee ID"
            required
            value={form.person_code}
            onChange={(value) => onChange({ person_code: value })}
            placeholder="EMP-00123"
            disabled={busy}
          />
          <TextInput
            label="Personal ID"
            value={form.personal_id}
            onChange={(value) => onChange({ personal_id: value })}
            placeholder="PAN number"
            disabled={busy}
          />
          <TextInput
            label="Aadhaar number"
            value={form.aadhaar_number}
            onChange={() => undefined}
            placeholder="Candidate submitted Aadhaar number"
            disabled
            readOnly
          />
          <TextInput
            label="First Name"
            required
            value={form.first_name}
            onChange={(value) => onChange({ first_name: value })}
            placeholder="First name"
            disabled={busy}
          />
          <TextInput
            label="Last Name"
            value={form.last_name}
            onChange={(value) => onChange({ last_name: value })}
            placeholder="Last name"
            disabled={busy}
          />
          <TextInput
            label="Email"
            required
            type="email"
            value={form.email}
            onChange={(value) => onChange({ email: value })}
            placeholder="name@studiolotus.in"
            disabled={busy}
          />
          <TextInput
            label="Mobile Number"
            value={form.mobile_number}
            onChange={(value) => onChange({ mobile_number: value })}
            placeholder="+91..."
            disabled={busy}
          />
          <TextInput
            label="Employment Type"
            required
            value={form.employment_type}
            onChange={(value) => onChange({ employment_type: value })}
            placeholder="permanent / intern"
            disabled={busy}
          />
          <TextInput
            label="Join Date"
            type="date"
            value={form.join_date}
            onChange={(value) => onChange({ join_date: value })}
            disabled={busy}
          />
          <TextInput
            label="Exit Date"
            type="date"
            value={form.exit_date}
            onChange={(value) => onChange({ exit_date: value })}
            disabled={busy}
          />
          <TextInput
            label="Role ID"
            value={form.role_id}
            onChange={(value) => onChange({ role_id: value })}
            placeholder="Numeric"
            disabled={busy}
          />
          <TextInput
            label="Grade ID"
            value={form.grade_id}
            onChange={(value) => onChange({ grade_id: value })}
            placeholder="Numeric"
            disabled={busy}
          />
          <TextInput
            label="Department ID"
            value={form.department_id}
            onChange={(value) => onChange({ department_id: value })}
            placeholder="Numeric"
            disabled={busy}
          />
          <TextInput
            label="Manager ID"
            value={form.manager_id}
            onChange={(value) => onChange({ manager_id: value })}
            placeholder="Person ID"
            disabled={busy}
          />
          <TextInput
            label="Status"
            value={form.status}
            onChange={(value) => onChange({ status: value })}
            placeholder="working"
            disabled={busy}
          />
          <TextInput
            label="Source System"
            value={form.source_system}
            onChange={(value) => onChange({ source_system: value })}
            placeholder="recruitment"
            disabled={busy}
          />
          <TextInput
            label="Full Name"
            value={form.full_name}
            onChange={(value) => onChange({ full_name: value })}
            placeholder="Auto-generated if blank"
            disabled={busy}
          />
          <TextInput
            label="Display Name"
            value={form.display_name}
            onChange={(value) => onChange({ display_name: value })}
            placeholder="Auto-generated if blank"
            disabled={busy}
          />
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.pan_verified}
              onChange={(event) => onChange({ pan_verified: event.target.checked })}
              disabled={busy}
            />
            <span>PAN matches uploaded document</span>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.aadhaar_verified}
              onChange={(event) => onChange({ aadhaar_verified: event.target.checked })}
              disabled={busy}
            />
            <span>Aadhaar matches uploaded document</span>
          </label>
        </div>

        {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={onSubmit}
            disabled={busy}
          >
            {busy ? "Marking..." : "Confirm mark as joined"}
          </button>
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}
