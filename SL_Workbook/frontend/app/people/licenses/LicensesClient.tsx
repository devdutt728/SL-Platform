"use client";

import { useEffect, useMemo, useState } from "react";
import { pplDelete, pplGet, pplPatch, pplPost } from "../_lib/client";
import type {
  LicenseAssignmentItem,
  LicenseAssignmentListResponse,
  LicenseContractItem,
  LicenseContractListResponse,
  LicenseSummaryResponse,
} from "../_lib/types";
import { formatDate } from "../_lib/format";
import { DirectoryWarning, PersonCombobox } from "../_components/PersonCombobox";

const ASSIGNMENT_LIMIT = 300;
const CONTRACT_LIMIT = 300;

type Tab = "assignments" | "contracts";

const emptyAssignment = {
  work_email: "",
  tool_name: "",
  plan: "",
  status: "Assigned",
  assigned_on: "",
  renewal_date: "",
  cost_centre: "",
  notes: "",
};

const emptyContract = {
  contract_key: "",
  software: "",
  category: "",
  entity: "",
  seats: "0",
  vendor: "",
  start_date: "",
  end_date: "",
  cost: "",
  currency: "INR",
  status: "Active",
  notes: "",
};

export function LicensesClient() {
  const [summary, setSummary] = useState<LicenseSummaryResponse | null>(null);
  const [assignments, setAssignments] = useState<LicenseAssignmentItem[]>([]);
  const [contracts, setContracts] = useState<LicenseContractItem[]>([]);
  const [search, setSearch] = useState("");
  const [tool, setTool] = useState("");
  const [tab, setTab] = useState<Tab>("assignments");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);
  const [contractForm, setContractForm] = useState(emptyContract);

  const load = () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ page: "1", limit: String(ASSIGNMENT_LIMIT) });
    if (search.trim()) qs.set("search", search.trim());
    if (tool) qs.set("tool", tool);
    Promise.all([
      pplGet<LicenseSummaryResponse>("/licenses/summary"),
      pplGet<LicenseAssignmentListResponse>(`/licenses/assignments?${qs.toString()}`),
      pplGet<LicenseContractListResponse>(`/licenses/contracts?page=1&limit=${CONTRACT_LIMIT}`),
    ])
      .then(([s, a, c]) => {
        setSummary(s);
        setAssignments(a.items);
        setContracts(c.items);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tool]);

  const tools = useMemo(
    () => summary?.software_summaries.map((s) => s.short_name).sort((a, b) => a.localeCompare(b)) || [],
    [summary],
  );

  async function createAssignment() {
    if (!assignmentForm.work_email.trim() || !assignmentForm.tool_name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await pplPost("/licenses/assignments", cleanPayload(assignmentForm));
      setAssignmentForm(emptyAssignment);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create assignment");
    } finally {
      setSaving(false);
    }
  }

  async function createContract() {
    if (!contractForm.contract_key.trim() || !contractForm.software.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await pplPost("/licenses/contracts", cleanPayload({
        ...contractForm,
        seats: Number(contractForm.seats || 0),
        cost: contractForm.cost ? Number(contractForm.cost) : null,
      }));
      setContractForm(emptyContract);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create contract");
    } finally {
      setSaving(false);
    }
  }

  async function patchAssignment(id: string, body: Record<string, unknown>) {
    await pplPatch(`/licenses/assignments/${id}`, cleanPayload(body));
    load();
  }

  async function patchContract(id: string, body: Record<string, unknown>) {
    await pplPatch(`/licenses/contracts/${id}`, cleanPayload(body));
    load();
  }

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <SummaryBand summary={summary} loading={loading} />

      {summary?.unknown_email_list?.length ? <UnknownEmailBanner issues={summary.unknown_email_list} /> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="public-panel">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Software Utilisation</h2>
              <p className="text-xs text-steel">Purchased seats versus people and shared assignments.</p>
            </div>
            <select value={tool} onChange={(e) => setTool(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
              <option value="">All tools</option>
              {tools.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(summary?.software_summaries || []).map((item) => <SoftwareCard key={item.short_name} item={item} />)}
            {!loading && !summary?.software_summaries.length ? <EmptyState label="No license contracts yet." /> : null}
          </div>
        </section>

        <section className="public-panel">
          <h2 className="text-xl font-semibold text-slate-900">Renewal Watch</h2>
          <p className="mt-1 text-xs text-steel">Expired and next 60 days.</p>
          <div className="mt-4 space-y-2">
            {(summary?.expiring_soon_list || []).slice(0, 8).map((contract) => (
              <div key={contract.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{contract.short_name || contract.software}</p>
                    <p className="text-xs text-steel">{contract.vendor || "Vendor not set"} · {formatDate(contract.end_date)}</p>
                  </div>
                  <RenewalBadge status={contract.renewal_status} days={contract.days_to_expiry} />
                </div>
              </div>
            ))}
            {!loading && !summary?.expiring_soon_list.length ? <EmptyState label="No renewals due in the next 60 days." /> : null}
          </div>
        </section>
      </div>

      <section className="public-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
            {(["assignments", "contracts"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${tab === t ? "bg-[var(--brand-color)] text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, tool, vendor"
            className="min-w-[240px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400"
          />
        </div>

        {tab === "assignments" ? (
          <AssignmentsPanel
            rows={assignments}
            form={assignmentForm}
            setForm={setAssignmentForm}
            saving={saving}
            onCreate={createAssignment}
            onPatch={patchAssignment}
            onDelete={async (id) => {
              await pplDelete(`/licenses/assignments/${id}`);
              load();
            }}
          />
        ) : (
          <ContractsPanel
            rows={contracts}
            form={contractForm}
            setForm={setContractForm}
            saving={saving}
            onCreate={createContract}
            onPatch={patchContract}
            onDelete={async (id) => {
              await pplDelete(`/licenses/contracts/${id}`);
              load();
            }}
          />
        )}
      </section>
    </div>
  );
}

function SummaryBand({ summary, loading }: { summary: LicenseSummaryResponse | null; loading: boolean }) {
  const totals = summary?.totals;
  const utilisation = totals?.purchased ? Math.round((totals.total_assigned / totals.purchased) * 100) : 0;
  const items = [
    ["Purchased", totals?.purchased ?? "—"],
    ["Assigned", totals?.assigned ?? "—"],
    ["Shared / Rooms", totals?.shared_assigned ?? "—"],
    ["Utilisation", loading ? "—" : `${utilisation}%`],
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="section-card bg-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-steel">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
        </div>
      ))}
    </section>
  );
}

function UnknownEmailBanner({ issues }: { issues: LicenseSummaryResponse["unknown_email_list"] }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="font-semibold">Unresolved license holder emails</div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {issues.slice(0, 6).map((issue) => (
          <div key={issue.email} className="rounded-xl bg-white/70 px-3 py-2">
            <span className="font-medium">{issue.email}</span>
            <span className="ml-2 text-xs text-amber-800">{Array.from(new Set(issue.tools)).join(", ")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SoftwareCard({ item }: { item: LicenseSummaryResponse["software_summaries"][number] }) {
  const pct = item.purchased ? Math.min(100, Math.round((item.total_assigned / item.purchased) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{item.short_name}</h3>
          <p className="text-xs text-steel">{item.category || "Uncategorised"} · {item.contracts} contract{item.contracts === 1 ? "" : "s"}</p>
        </div>
        <span className="workbook-chip text-[11px]">{item.total_assigned}/{item.purchased}</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-[var(--brand-color)]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex justify-between text-xs text-steel">
        <span>People {item.assigned}</span>
        <span>Shared {item.shared_assigned}</span>
      </div>
    </div>
  );
}

function AssignmentsPanel(props: {
  rows: LicenseAssignmentItem[];
  form: typeof emptyAssignment;
  setForm: (form: typeof emptyAssignment) => void;
  saving: boolean;
  onCreate: () => void;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { rows, form, setForm, saving, onCreate, onPatch, onDelete } = props;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 lg:grid-cols-8">
        <div className="lg:col-span-2">
          <PersonCombobox
            value={form.work_email}
            onChange={(v) => setForm({ ...form, work_email: v })}
            onPick={(p) => setForm({ ...form, work_email: p.email })}
            placeholder="holder (name or email)"
            inputClassName="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400"
          />
          <DirectoryWarning email={form.work_email} />
        </div>
        <Input value={form.tool_name} placeholder="license / tool" onChange={(v) => setForm({ ...form, tool_name: v })} />
        <Input value={form.plan} placeholder="plan" onChange={(v) => setForm({ ...form, plan: v })} />
        <Input value={form.status} placeholder="status" onChange={(v) => setForm({ ...form, status: v })} />
        <Input type="date" value={form.assigned_on} placeholder="assigned" onChange={(v) => setForm({ ...form, assigned_on: v })} />
        <Input value={form.cost_centre} placeholder="cost centre" onChange={(v) => setForm({ ...form, cost_centre: v })} />
        <button disabled={saving} onClick={onCreate} className="rounded-xl bg-[var(--brand-color)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Assign</button>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Holder</th><th>Tool</th><th>Plan</th><th>Status</th><th>Assigned</th><th>Renewal</th><th>Kind</th><th className="text-right pr-4">Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3"><div className="font-medium text-slate-900">{r.holder_name || r.work_email}</div><div className="text-xs text-steel">{r.work_email}</div></td>
                <td>{r.tool_short_name || r.tool_name}</td>
                <td>{r.plan || "—"}</td>
                <td><StatusSelect value={r.status} onChange={(status) => onPatch(r.id, { status })} /></td>
                <td>{formatDate(r.assigned_on)}</td>
                <td>{formatDate(r.renewal_date)}</td>
                <td><HolderKind kind={r.holder_kind} /></td>
                <td className="pr-4 text-right">
                  <button onClick={() => onPatch(r.id, { status: r.status === "Revoked" ? "Assigned" : "Revoked" })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    {r.status === "Revoked" ? "Restore" : "Revoke"}
                  </button>
                  <button onClick={() => onDelete(r.id)} className="ml-2 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={8}><EmptyState label="No assignments match the current filters." /></td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContractsPanel(props: {
  rows: LicenseContractItem[];
  form: typeof emptyContract;
  setForm: (form: typeof emptyContract) => void;
  saving: boolean;
  onCreate: () => void;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { rows, form, setForm, saving, onCreate, onPatch, onDelete } = props;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 lg:grid-cols-8">
        <Input value={form.contract_key} placeholder="contract key" onChange={(v) => setForm({ ...form, contract_key: v })} />
        <Input value={form.software} placeholder="software" onChange={(v) => setForm({ ...form, software: v })} />
        <Input value={form.vendor} placeholder="vendor" onChange={(v) => setForm({ ...form, vendor: v })} />
        <Input value={form.seats} placeholder="seats" onChange={(v) => setForm({ ...form, seats: v })} />
        <Input type="date" value={form.start_date} placeholder="start" onChange={(v) => setForm({ ...form, start_date: v })} />
        <Input type="date" value={form.end_date} placeholder="end" onChange={(v) => setForm({ ...form, end_date: v })} />
        <Input value={form.cost} placeholder="cost" onChange={(v) => setForm({ ...form, cost: v })} />
        <button disabled={saving} onClick={onCreate} className="rounded-xl bg-[var(--brand-color)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Add Contract</button>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1060px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Contract</th><th>Software</th><th>Vendor</th><th>Seats</th><th>Cost</th><th>End Date</th><th>Renewal</th><th className="text-right pr-4">Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3"><div className="font-medium text-slate-900">{r.contract_key}</div><div className="text-xs text-steel">{r.entity || "Entity not set"}</div></td>
                <td>{r.short_name || r.software}</td>
                <td>{r.vendor || "—"}</td>
                <td><InlineNumber value={r.seats} onSave={(seats) => onPatch(r.id, { seats })} /></td>
                <td>{r.cost != null ? `${r.currency} ${Math.round(r.cost).toLocaleString("en-IN")}` : "—"}</td>
                <td>{formatDate(r.end_date)}</td>
                <td><RenewalBadge status={r.renewal_status} days={r.days_to_expiry} /></td>
                <td className="pr-4 text-right">
                  <button onClick={() => onDelete(r.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={8}><EmptyState label="No contracts match the current filters." /></td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400" />;
}

function StatusSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
      <option>Assigned</option>
      <option>Revoked</option>
      <option>Available</option>
    </select>
  );
}

function InlineNumber({ value, onSave }: { value: number; onSave: (value: number) => void }) {
  const [local, setLocal] = useState(String(value ?? 0));
  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onSave(Number(local || 0))}
      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
    />
  );
}

function HolderKind({ kind }: { kind: string }) {
  const cls = kind === "person" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : kind === "unassigned" ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>{kind}</span>;
}

function RenewalBadge({ status, days }: { status: string; days: number | null }) {
  const cls = status === "Expired" ? "border-red-200 bg-red-50 text-red-700" : status === "Expiring Soon" ? "border-amber-200 bg-amber-50 text-amber-700" : status === "Watch" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const label = days == null ? status : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`;
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="px-4 py-8 text-center text-sm text-slate-400">{label}</div>;
}

function cleanPayload<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== "" && value !== undefined),
  );
}
