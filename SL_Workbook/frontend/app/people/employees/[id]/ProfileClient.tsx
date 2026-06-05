"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { pplDelete, pplGet, pplPatch } from "../../_lib/client";
import type { EmployeeProfile, MeResponse } from "../../_lib/types";
import { STATUS_STYLES, initialsFrom } from "../../_lib/format";
import { Field, type FieldDef } from "../../_components/Field";
import { AuditSidebar } from "../../_components/AuditSidebar";
import {
  ADDRESS_FIELDS, COMPLIANCE_FIELDS, EXIT_FIELDS, PERSONAL_FIELDS, POLICY_FIELDS, WORK_FIELDS,
} from "../../_lib/fields";

type TabKey = "personal" | "work" | "address" | "policy" | "compliance" | "exit";
type Draft = Record<string, string | boolean | null>;

const TABS: { key: TabKey; label: string; adminOnly?: boolean }[] = [
  { key: "personal", label: "Personal" },
  { key: "work", label: "Work" },
  { key: "address", label: "Address" },
  { key: "policy", label: "Policy" },
  { key: "compliance", label: "Compliance", adminOnly: true },
  { key: "exit", label: "Exit", adminOnly: true },
];

export function ProfileClient({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("personal");
  const [auditOpen, setAuditOpen] = useState(false);
  const [revealCompliance, setRevealCompliance] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, prof] = await Promise.all([
        pplGet<MeResponse>("/auth/me"),
        pplGet<EmployeeProfile>(`/employees/${employeeId}`),
      ]);
      setMe(meRes);
      setProfile(prof);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = me?.access_level === "edit" || me?.access_level === "admin";
  const isAdmin = me?.access_level === "admin";

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-400">Loading profile…</div>;
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>;
  if (!profile) return null;

  const name = profile.identity.full_name || profile.identity.display_name || profile.ext.employee_number;
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const status = profile.ext.employment_status;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
      <div>
        {/* Identity header */}
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--brand-color)]/10 text-xl font-semibold text-[var(--brand-color)]">
            {initialsFrom(name, profile.ext.employee_number)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-2xl font-semibold text-slate-900">{name}</h1>
              <StatusBadge
                status={status}
                canChange={isAdmin}
                onChange={async (next, exitDate) => {
                  await pplPatch(`/employees/${employeeId}/status`, { employment_status: next, exit_date: exitDate });
                  await load();
                }}
              />
            </div>
            <p className="mt-0.5 text-sm text-steel">
              {profile.work_info.job_title || "—"} · {profile.ext.employee_number}
              {profile.identity.email ? ` · ${profile.identity.email}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setAuditOpen(true)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              History
            </button>
            {isAdmin ? (
              <button
                onClick={async () => {
                  if (!confirm("Soft-delete this employee? They will be hidden from the directory.")) return;
                  await pplDelete(`/employees/${employeeId}`);
                  router.push("/people/employees");
                }}
                className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            ) : null}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-5 flex flex-wrap gap-1 border-b border-slate-200">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "border-[var(--brand-color)] text-[var(--brand-color)]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {tab === "personal" && (
            <SectionEditor title="Personal" fields={PERSONAL_FIELDS} data={profile.personal} editable={canEdit}
              onSave={(changes) => pplPatch(`/employees/${employeeId}/profile`, changes)} onSaved={load} />
          )}
          {tab === "work" && (
            <SectionEditor title="Work" fields={WORK_FIELDS} data={workData(profile)} editable={canEdit}
              extra={<ManagerNote profile={profile} />}
              onSave={(changes) => pplPatch(`/employees/${employeeId}/work_info`, changes)} onSaved={load} />
          )}
          {tab === "address" && (
            <AddressEditor profile={profile} editable={canEdit} employeeId={employeeId} onSaved={load} />
          )}
          {tab === "policy" && (
            <SectionEditor title="Policy" fields={POLICY_FIELDS} data={profile.policy} editable={canEdit}
              onSave={(changes) => pplPatch(`/employees/${employeeId}/policy`, changes)} onSaved={load} />
          )}
          {tab === "compliance" && isAdmin && (
            <ComplianceEditor
              profile={profile} reveal={revealCompliance} onReveal={() => setRevealCompliance(true)}
              onSave={(changes) => pplPatch(`/employees/${employeeId}/compliance`, changes)} onSaved={load} />
          )}
          {tab === "exit" && isAdmin && (
            <SectionEditor title="Exit" fields={EXIT_FIELDS} data={profile.exit} editable={isAdmin}
              onSave={(changes) => pplPatch(`/employees/${employeeId}/exit`, changes)} onSaved={load} />
          )}
        </div>
      </div>

      <AuditSidebar employeeId={employeeId} open={auditOpen} onClose={() => setAuditOpen(false)} />
    </div>
  );
}

function workData(p: EmployeeProfile): Draft {
  // WORK_FIELDS uses reporting_manager_number; seed it from the profile.
  return { ...p.work_info, reporting_manager_number: p.work_info.reporting_manager_number ?? null } as Draft;
}

function ManagerNote({ profile }: { profile: EmployeeProfile }) {
  const name = profile.work_info.reporting_manager_name;
  if (!name) return null;
  return <p className="mb-3 text-xs text-steel">Reporting to <span className="font-medium text-slate-700">{name}</span> ({profile.work_info.reporting_manager_number})</p>;
}

// ── Generic section editor with dirty-state save ──────────────────────────────
function SectionEditor({
  title, fields, data, editable, onSave, onSaved, extra,
}: {
  title: string;
  fields: FieldDef[];
  data: Record<string, string | boolean | null>;
  editable: boolean;
  onSave: (changes: Draft) => Promise<unknown>;
  onSaved: () => Promise<void> | void;
  extra?: React.ReactNode;
}) {
  const initial = useMemo<Draft>(() => {
    const out: Draft = {};
    for (const f of fields) out[f.key] = (data?.[f.key] ?? null) as string | boolean | null;
    return out;
  }, [fields, data]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setDraft(initial), [initial]);

  const changes = useMemo<Draft>(() => {
    const out: Draft = {};
    for (const f of fields) {
      const a = draft[f.key] ?? null;
      const b = initial[f.key] ?? null;
      if (a !== b) out[f.key] = a;
    }
    return out;
  }, [draft, initial, fields]);
  const dirty = Object.keys(changes).length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      {extra}
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <Field key={f.key} def={f} value={draft[f.key]} editable={editable}
            onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))} />
        ))}
      </div>
      {err ? <p className="mt-3 text-xs text-red-600">{err}</p> : null}
      <SaveBar
        dirty={dirty && editable}
        saving={saving}
        onCancel={() => setDraft(initial)}
        onSave={async () => {
          setSaving(true);
          setErr(null);
          try {
            await onSave(changes);
            await onSaved();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

function AddressEditor({ profile, editable, employeeId, onSaved }: { profile: EmployeeProfile; editable: boolean; employeeId: string; onSaved: () => Promise<void> | void }) {
  const [current, setCurrent] = useState<Draft>({ ...profile.address.current } as Draft);
  const [permanent, setPermanent] = useState<Draft>({ ...profile.address.permanent } as Draft);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const initCurrent = useMemo(() => ({ ...profile.address.current }), [profile]);
  const initPermanent = useMemo(() => ({ ...profile.address.permanent }), [profile]);
  useEffect(() => { setCurrent({ ...initCurrent } as Draft); setPermanent({ ...initPermanent } as Draft); }, [initCurrent, initPermanent]);

  const diff = (draft: Draft, init: Record<string, string | null>) => {
    const out: Draft = {};
    for (const f of ADDRESS_FIELDS) {
      const a = draft[f.key] ?? null;
      const b = (init[f.key] ?? null) as string | null;
      if (a !== b) out[f.key] = a;
    }
    return out;
  };
  const curChanges = diff(current, initCurrent);
  const permChanges = diff(permanent, initPermanent);
  const dirty = Object.keys(curChanges).length > 0 || Object.keys(permChanges).length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {([["Current", current, setCurrent], ["Permanent", permanent, setPermanent]] as const).map(([label, draft, setter]) => (
          <div key={label}>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{label} Address</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ADDRESS_FIELDS.map((f) => (
                <Field key={f.key} def={f} value={draft[f.key]} editable={editable}
                  onChange={(k, v) => setter((d) => ({ ...d, [k]: v }))} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {err ? <p className="mt-3 text-xs text-red-600">{err}</p> : null}
      <SaveBar
        dirty={dirty && editable}
        saving={saving}
        onCancel={() => { setCurrent({ ...initCurrent } as Draft); setPermanent({ ...initPermanent } as Draft); }}
        onSave={async () => {
          setSaving(true);
          setErr(null);
          try {
            const body: Record<string, Draft> = {};
            if (Object.keys(curChanges).length) body.current = curChanges;
            if (Object.keys(permChanges).length) body.permanent = permChanges;
            await pplPatch(`/employees/${employeeId}/address`, body);
            await onSaved();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

function ComplianceEditor({ profile, reveal, onReveal, onSave, onSaved }: {
  profile: EmployeeProfile; reveal: boolean; onReveal: () => void;
  onSave: (changes: Draft) => Promise<unknown>; onSaved: () => Promise<void> | void;
}) {
  const data = profile.compliance || { pan: null, aadhaar: null, pf_number: null, uan_number: null };
  if (!reveal) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center">
        <p className="text-sm font-medium text-amber-800">Government IDs are encrypted and access-logged.</p>
        <p className="mt-1 text-xs text-amber-700">Revealing PAN / Aadhaar / PF / UAN is recorded in the audit trail.</p>
        <button onClick={onReveal} className="mt-4 rounded-xl bg-[var(--brand-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[#cf380f]">
          Reveal &amp; view
        </button>
      </div>
    );
  }
  return (
    <SectionEditor title="Compliance" fields={COMPLIANCE_FIELDS} data={data as Draft} editable onSave={onSave} onSaved={onSaved} />
  );
}

function SaveBar({ dirty, saving, onSave, onCancel }: { dirty: boolean; saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <AnimatePresence>
      {dirty ? (
        <motion.div
          className="mt-5 flex items-center justify-end gap-2"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
        >
          <button onClick={onCancel} disabled={saving} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button onClick={onSave} disabled={saving} className="rounded-xl bg-[var(--brand-color)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#cf380f] disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function StatusBadge({ status, canChange, onChange }: { status: string; canChange: boolean; onChange: (next: string, exitDate: string | null) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const badge = (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[status] || STATUS_STYLES.relieved}`}>
      {status}
    </span>
  );
  if (!canChange) return badge;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}>{badge}</button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {["working", "relieved", "terminated"].filter((s) => s !== status).map((s) => (
            <button
              key={s}
              onClick={async () => {
                setOpen(false);
                const needsExit = s !== "working";
                const exitDate = needsExit ? new Date().toISOString().slice(0, 10) : null;
                if (!confirm(`Change status to "${s}"?`)) return;
                await onChange(s, exitDate);
              }}
              className="block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium capitalize text-slate-700 hover:bg-slate-100"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
