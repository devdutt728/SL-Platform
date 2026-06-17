"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { pplPatch } from "../_lib/client";
import type { GroupInfo, OrgPerson } from "../_lib/org-types";
import { initialsFrom } from "../_lib/format";

type Draft = {
  full_name: string;
  email: string;
  mobile_number: string;
  title: string;
  department: string;
  sub_department: string;
  business_unit: string;
  group_key: string;
  org_level: string;
  include_in_org: boolean;
  source_manager_emp: string;
  manager_override_emp: string;
  designation_level: string;
  designation_color: string;
  prior_exp_years: string;
  notes: string;
};

export function PersonDrawer({
  person,
  groups,
  canEdit,
  onClose,
  onSaved,
}: {
  person: OrgPerson | null;
  groups: GroupInfo[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  useEffect(() => {
    if (!person) return;
    setEditing(false);
    setError(null);
    setDraft({
      full_name: person.name || "",
      email: person.email || "",
      mobile_number: person.mobile_number || "",
      title: person.title || "",
      department: person.department || "",
      sub_department: person.sub_department || "",
      business_unit: person.business_unit || "",
      group_key: person.group_key || "",
      org_level: person.org_level || "",
      include_in_org: person.include_in_org,
      source_manager_emp: person.source_manager_emp || "",
      manager_override_emp: person.manager_override_emp || "",
      designation_level: person.designation_level || "",
      designation_color: person.designation_color || "",
      prior_exp_years: person.prior_exp_years == null ? "" : String(person.prior_exp_years),
      notes: "",
    });
  }, [person]);

  async function save() {
    if (!person) return;
    setSaving(true);
    setError(null);
    try {
      await pplPatch(`/org/employees/${encodeURIComponent(person.employee_no)}/details`, cleanPayload({
        ...draft,
        prior_exp_years: draft.prior_exp_years ? Number(draft.prior_exp_years) : null,
      }));
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save person");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {person ? (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.22 }}
          >
            <div className="flex items-start gap-3 border-b border-slate-100 p-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ backgroundColor: draft.designation_color || person.designation_color || "#707A87" }}>
                {initialsFrom(draft.full_name || person.name, person.employee_no)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-semibold text-slate-900">{draft.full_name || person.name}</h3>
                <p className="text-sm text-steel">{draft.title || "—"}</p>
                <p className="text-xs text-slate-400">{person.employee_no}</p>
              </div>
              {canEdit ? (
                <button onClick={() => setEditing((v) => !v)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  {editing ? "View" : "Edit"}
                </button>
              ) : null}
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700">x</button>
            </div>

            <div className="flex-1 space-y-3 overflow-auto p-5 text-sm">
              {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
              {editing ? (
                <>
                  <Field label="Name" value={draft.full_name} onChange={(full_name) => setDraft({ ...draft, full_name })} />
                  <Field label="Email" value={draft.email} onChange={(email) => setDraft({ ...draft, email })} />
                  <Field label="Mobile" value={draft.mobile_number} onChange={(mobile_number) => setDraft({ ...draft, mobile_number })} />
                  <Field label="Title" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
                  <Field label="Department" value={draft.department} onChange={(department) => setDraft({ ...draft, department })} />
                  <Field label="Sub Department" value={draft.sub_department} onChange={(sub_department) => setDraft({ ...draft, sub_department })} />
                  <Field label="Business Unit" value={draft.business_unit} onChange={(business_unit) => setDraft({ ...draft, business_unit })} />
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Group</span>
                    <select value={draft.group_key} onChange={(e) => setDraft({ ...draft, group_key: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                      {groups.map((group) => <option key={group.group_key} value={group.group_key}>{group.principal_name} · {group.name}</option>)}
                    </select>
                  </label>
                  <Field label="Org Level" value={draft.org_level} placeholder="Member / Team Lead / Principal" onChange={(org_level) => setDraft({ ...draft, org_level })} />
                  <Field label="Designation" value={draft.designation_level} onChange={(designation_level) => setDraft({ ...draft, designation_level })} />
                  <Field label="Designation Color" value={draft.designation_color} onChange={(designation_color) => setDraft({ ...draft, designation_color })} />
                  <Field label="Source Manager Emp #" value={draft.source_manager_emp} onChange={(source_manager_emp) => setDraft({ ...draft, source_manager_emp })} />
                  <Field label="Manager Override Emp #" value={draft.manager_override_emp} onChange={(manager_override_emp) => setDraft({ ...draft, manager_override_emp })} />
                  <Field label="Prior Experience Years" value={draft.prior_exp_years} onChange={(prior_exp_years) => setDraft({ ...draft, prior_exp_years })} />
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Include in Org</span>
                    <input type="checkbox" checked={draft.include_in_org} onChange={(e) => setDraft({ ...draft, include_in_org: e.target.checked })} />
                  </label>
                </>
              ) : (
                <>
                  <Row label="Designation" value={person.designation_level} />
                  <Row label="Group" value={`${person.principal} · ${person.group_name}`} />
                  <Row label="Email" value={person.email} />
                  <Row label="Mobile" value={person.mobile_number} />
                  <Row label="Department" value={person.department} />
                  <Row label="Sub Department" value={person.sub_department} />
                  <Row label="Business Unit" value={person.business_unit} />
                  <Row label="Org Level" value={person.org_level} />
                  <Row label="SL Experience" value={person.sl_exp_display} />
                  <Row label="Overall Experience" value={person.o_exp_display} />
                  <Row label="Licenses" value={String(person.license_count)} />
                  {person.manager_override_emp ? <Row label="Manager Override" value={person.manager_override_emp} /> : null}
                  {person.source_manager_emp ? <Row label="HR Manager" value={person.source_manager_emp} /> : null}
                </>
              )}
            </div>

            {editing ? (
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4">
                <button onClick={() => setEditing(false)} className="ppl-btn ppl-btn--ghost">Cancel</button>
                <button disabled={saving} onClick={save} className="ppl-btn ppl-btn--primary">{saving ? "Saving..." : "Save changes"}</button>
              </div>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function emptyDraft(): Draft {
  return {
    full_name: "",
    email: "",
    mobile_number: "",
    title: "",
    department: "",
    sub_department: "",
    business_unit: "",
    group_key: "",
    org_level: "",
    include_in_org: true,
    source_manager_emp: "",
    manager_override_emp: "",
    designation_level: "",
    designation_color: "",
    prior_exp_years: "",
    notes: "",
  };
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 pb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-right text-sm text-slate-800">{value || "—"}</span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[var(--brand-color)] focus:outline-none" />
    </label>
  );
}

function cleanPayload(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
}
