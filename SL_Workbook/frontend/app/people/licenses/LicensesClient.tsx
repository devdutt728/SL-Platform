"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { DirectoryWarning, PersonCombobox } from "../_components/PersonCombobox";
import { pplDelete, pplGet, pplPatch, pplPost } from "../_lib/client";
import { formatDate } from "../_lib/format";
import type {
  LicenseAssignmentItem,
  LicenseAssignmentListResponse,
  LicenseContractItem,
  LicenseContractListResponse,
  LicenseHolderKind,
  LicenseSummaryResponse,
  ReconciliationIssue,
  ReconciliationResponse,
} from "../_lib/types";

const ASSIGNMENT_LIMIT = 500;
const CONTRACT_LIMIT = 500;

type Tab = "assignments" | "contracts" | "warnings";
type SortDir = "asc" | "desc";
type AssignmentSortKey = "holder" | "tool" | "status" | "assigned_on" | "renewal_date" | "kind";
type ContractSortKey = "software" | "vendor" | "seats" | "cost" | "end_date" | "renewal";

const emptyAssignment = {
  work_email: "",
  tool_name: "",
  plan: "",
  renewal_date: "",
  notes: "",
};

const emptyContract = {
  contract_key: "",
  software: "",
  category: "",
  entity: "",
  seats: "1",
  vendor: "",
  start_date: "",
  end_date: "",
  cost: "",
  currency: "INR",
  status: "Active",
  notes: "",
};

interface ToolOption {
  label: string;
  software: string;
  plan: string;
  renewal_date: string;
}

export function LicensesClient() {
  const [summary, setSummary] = useState<LicenseSummaryResponse | null>(null);
  const [assignments, setAssignments] = useState<LicenseAssignmentItem[]>([]);
  const [contracts, setContracts] = useState<LicenseContractItem[]>([]);
  const [licenseWarnings, setLicenseWarnings] = useState<ReconciliationIssue[]>([]);
  const [search, setSearch] = useState("");
  const [tool, setTool] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [tab, setTab] = useState<Tab>("assignments");
  const [assignmentSort, setAssignmentSort] = useState<{ key: AssignmentSortKey; dir: SortDir }>({ key: "renewal_date", dir: "asc" });
  const [contractSort, setContractSort] = useState<{ key: ContractSortKey; dir: SortDir }>({ key: "end_date", dir: "asc" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);
  const [contractForm, setContractForm] = useState(emptyContract);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      pplGet<LicenseSummaryResponse>("/licenses/summary"),
      pplGet<LicenseAssignmentListResponse>(`/licenses/assignments?page=1&limit=${ASSIGNMENT_LIMIT}`),
      pplGet<LicenseContractListResponse>(`/licenses/contracts?page=1&limit=${CONTRACT_LIMIT}`),
      pplGet<ReconciliationResponse>("/bulk/reconciliation"),
    ])
      .then(([s, a, c, r]) => {
        setSummary(s);
        setAssignments(a.items);
        setContracts(c.items);
        setLicenseWarnings(r.issues.filter((issue) => issue.module === "Licenses"));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const toolOptions = useMemo<ToolOption[]>(() => {
    const byLabel = new Map<string, ToolOption>();
    for (const contract of summary?.all_contracts || contracts) {
      const label = contract.short_name || contract.software;
      if (!label) continue;
      const current = byLabel.get(label);
      const renewal_date = contract.end_date || "";
      const option = {
        label,
        software: contract.software,
        plan: contract.user_type || contract.contract_type || "",
        renewal_date,
      };
      if (!current || compareNullableDate(renewal_date, current.renewal_date) < 0) {
        byLabel.set(label, option);
      }
    }
    return Array.from(byLabel.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [contracts, summary]);

  const statusOptions = useMemo(
    () => Array.from(new Set(assignments.map((row) => row.status).filter(Boolean))).sort(),
    [assignments],
  );

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = assignments.filter((row) => {
      if (tool && (row.tool_short_name || row.tool_name) !== tool) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (kindFilter && row.holder_kind !== kindFilter) return false;
      if (!q) return true;
      return [
        row.holder_name,
        row.work_email,
        row.tool_name,
        row.tool_short_name,
        row.plan,
        row.status,
        row.notes,
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
    return sortRows(rows, assignmentSort, assignmentSortValue);
  }, [assignments, assignmentSort, kindFilter, search, statusFilter, tool]);

  const filteredContracts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = contracts.filter((row) => {
      if (tool && (row.short_name || row.software) !== tool) return false;
      if (!q) return true;
      return [
        row.contract_key,
        row.software,
        row.short_name,
        row.vendor,
        row.category,
        row.entity,
        row.status,
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
    return sortRows(rows, contractSort, contractSortValue);
  }, [contracts, contractSort, search, tool]);

  const filteredWarnings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return licenseWarnings.filter((issue) => {
      if (tool && !String(issue.detail || "").toLowerCase().includes(tool.toLowerCase())) return false;
      if (!q) return true;
      return [
        issue.severity,
        issue.entity_key,
        issue.email,
        issue.name,
        issue.issue,
        issue.detail,
        issue.correction_point,
        issue.recommended_action,
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [licenseWarnings, search, tool]);

  async function createAssignment() {
    if (!assignmentForm.work_email.trim() || !assignmentForm.tool_name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await pplPost("/licenses/assignments", cleanPayload({ ...assignmentForm, status: "Assigned" }));
      setAssignmentForm(emptyAssignment);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create assignment");
    } finally {
      setSaving(false);
    }
  }

  async function createContract() {
    if (!contractForm.software.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const contract_key = contractForm.contract_key.trim() || makeContractKey(contractForm);
      await pplPost("/licenses/contracts", cleanPayload({
        ...contractForm,
        contract_key,
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

      <ExecutiveBand summary={summary} assignments={assignments} contracts={contracts} warningCount={licenseWarnings.filter((issue) => issue.severity === "warning").length} loading={loading} />

      <section className="public-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">License Control</h2>
            <p className="mt-1 text-xs text-steel">Search, filter, assign, revoke, and review contracts from one working table.</p>
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
            {(["assignments", "contracts", "warnings"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${tab === t ? "bg-[var(--brand-color)] text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(260px,1fr)_180px_160px_150px_auto]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "warnings" ? "Search warning, person, email, system, correction point" : "Search holder, email, tool, vendor"}
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400"
          />
          <FilterSelect value={tool} onChange={setTool} label="All tools" options={toolOptions.map((option) => option.label)} />
          {tab === "assignments" ? (
            <>
              <FilterSelect value={statusFilter} onChange={setStatusFilter} label="All statuses" options={statusOptions} />
              <FilterSelect value={kindFilter} onChange={setKindFilter} label="All holders" options={["person", "shared", "unassigned"]} labels={{ person: "People", shared: "Shared", unassigned: "Unassigned" }} />
            </>
          ) : tab === "warnings" ? (
            <>
              <div />
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {filteredWarnings.length} visible
              </div>
            </>
          ) : (
            <>
              <div />
              <div />
            </>
          )}
          {search || tool || statusFilter || kindFilter ? (
            <button
              onClick={() => {
                setSearch("");
                setTool("");
                setStatusFilter("");
                setKindFilter("");
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Clear
            </button>
          ) : (
            <div />
          )}
        </div>

        {tab === "assignments" ? (
          <AssignmentsPanel
            rows={filteredAssignments}
            form={assignmentForm}
            setForm={setAssignmentForm}
            saving={saving}
            onCreate={createAssignment}
            onPatch={patchAssignment}
            onDelete={async (id) => {
              await pplDelete(`/licenses/assignments/${id}`);
              load();
            }}
            sort={assignmentSort}
            setSort={setAssignmentSort}
            toolOptions={toolOptions}
          />
        ) : tab === "warnings" ? (
          <WarningsPanel rows={filteredWarnings} />
        ) : (
          <ContractsPanel
            rows={filteredContracts}
            form={contractForm}
            setForm={setContractForm}
            saving={saving}
            onCreate={createContract}
            onPatch={patchContract}
            onDelete={async (id) => {
              await pplDelete(`/licenses/contracts/${id}`);
              load();
            }}
            sort={contractSort}
            setSort={setContractSort}
            toolOptions={toolOptions}
          />
        )}
      </section>

      <section className="public-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Portfolio Health</h2>
            <p className="mt-1 text-xs text-steel">Purchased seats versus actual assignments, grouped by software.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(summary?.software_summaries || []).map((item) => <SoftwareCard key={item.short_name} item={item} />)}
          {!loading && !summary?.software_summaries.length ? <EmptyState label="No license contracts yet." /> : null}
        </div>
      </section>
    </div>
  );
}

function ExecutiveBand({ summary, assignments, contracts, warningCount, loading }: { summary: LicenseSummaryResponse | null; assignments: LicenseAssignmentItem[]; contracts: LicenseContractItem[]; warningCount: number; loading: boolean }) {
  const totals = summary?.totals;
  const utilisation = totals?.purchased ? Math.round((totals.total_assigned / totals.purchased) * 100) : 0;
  const activeAssignments = assignments.filter((row) => isActive(row.status)).length;
  const renewalRisk = contracts.filter((row) => row.days_to_expiry != null && row.days_to_expiry <= 60).length;
  const unassigned = assignments.filter((row) => row.holder_kind === "unassigned" || !row.work_email).length;
  const items = [
    { label: "Purchased Seats", value: totals?.purchased ?? "—", detail: `${summary?.software_summaries.length || 0} software titles` },
    { label: "Active Use", value: loading ? "—" : activeAssignments, detail: `${totals?.shared_assigned || 0} shared / room accounts` },
    { label: "Utilisation", value: loading ? "—" : `${utilisation}%`, detail: utilisation > 95 ? "At capacity" : utilisation < 65 ? "Under-used capacity" : "Healthy range" },
    { label: "Renewal Risk", value: loading ? "—" : renewalRisk, detail: "Due or expired within 60 days", tone: renewalRisk ? "risk" : "ok" },
    { label: "Unassigned", value: loading ? "—" : unassigned, detail: "Rows without a real holder", tone: unassigned ? "warn" : "ok" },
    { label: "Warnings", value: loading ? "—" : warningCount, detail: "Installed software without assignment", tone: warningCount ? "warn" : "ok" },
  ];
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className={`rounded-2xl border bg-white p-4 ${item.tone === "risk" ? "border-red-200" : item.tone === "warn" ? "border-amber-200" : "border-slate-200"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-steel">{item.label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{item.value}</p>
          <p className="mt-1 text-xs text-steel">{item.detail}</p>
        </div>
      ))}
    </section>
  );
}

function WarningsPanel({ rows }: { rows: ReconciliationIssue[] }) {
  return (
    <div className="mt-4 overflow-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[1280px] border-collapse text-sm">
        <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Severity</th>
            <th>System</th>
            <th>Person</th>
            <th>Issue</th>
            <th>Where to Correct</th>
            <th>Recommended Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((issue, index) => (
            <tr key={`${issue.entity_key}-${issue.email}-${issue.issue}-${index}`} className="border-t border-slate-100 align-top">
              <td className="px-4 py-3"><SeverityBadge severity={issue.severity} /></td>
              <td className="py-3">
                <div className="font-medium text-slate-900">{issue.entity_key}</div>
                <div className="text-xs text-steel">{issue.entity_type}</div>
              </td>
              <td className="py-3">
                <div className="font-medium text-slate-900">{issue.name || "—"}</div>
                <div className="text-xs text-steel">{issue.email || "No email"}</div>
              </td>
              <td className="max-w-[360px] py-3">
                <div className="font-medium text-slate-900">{issue.issue}</div>
                <div className="mt-1 text-xs text-steel">{issue.detail}</div>
              </td>
              <td className="max-w-[360px] py-3 pr-4 text-xs text-slate-700">{issue.correction_point || "Review the system and license rows."}</td>
              <td className="max-w-[280px] py-3 pr-4 text-xs text-slate-700">{issue.recommended_action}</td>
            </tr>
          ))}
          {!rows.length ? <tr><td colSpan={6}><EmptyState label="No license warnings match the current filters." /></td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls = severity === "critical" ? "border-red-200 bg-red-50 text-red-700" : severity === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-200 bg-blue-50 text-blue-700";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>{severity}</span>;
}

function AssignmentsPanel(props: {
  rows: LicenseAssignmentItem[];
  form: typeof emptyAssignment;
  setForm: (form: typeof emptyAssignment) => void;
  saving: boolean;
  onCreate: () => void;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  sort: { key: AssignmentSortKey; dir: SortDir };
  setSort: (sort: { key: AssignmentSortKey; dir: SortDir }) => void;
  toolOptions: ToolOption[];
}) {
  const { rows, form, setForm, saving, onCreate, onPatch, onDelete, sort, setSort, toolOptions } = props;
  const setTool = (value: string) => {
    const match = findToolOption(toolOptions, value);
    setForm({
      ...form,
      tool_name: value,
      plan: form.plan || match?.plan || "",
      renewal_date: form.renewal_date || match?.renewal_date || "",
    });
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(260px,1.4fr)_minmax(220px,1.1fr)_150px_150px_120px]">
          <div>
            <PersonCombobox
              value={form.work_email}
              onChange={(v) => setForm({ ...form, work_email: v })}
              onPick={(p) => setForm({ ...form, work_email: p.email })}
              placeholder="person or shared email"
              inputClassName="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400"
            />
            <DirectoryWarning email={form.work_email} />
          </div>
          <Input list="license-tool-options" value={form.tool_name} placeholder="license / tool" onChange={setTool} />
          <Input value={form.plan} placeholder="plan optional" onChange={(v) => setForm({ ...form, plan: v })} />
          <Input type="date" value={form.renewal_date} placeholder="renewal" onChange={(v) => setForm({ ...form, renewal_date: v })} />
          <button disabled={saving || !form.work_email.trim() || !form.tool_name.trim()} onClick={onCreate} className="rounded-xl bg-[var(--brand-color)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Assign</button>
        </div>
        <datalist id="license-tool-options">
          {toolOptions.map((option) => <option key={option.label} value={option.label} />)}
        </datalist>
      </div>

      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1040px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <SortTh label="Holder" active={sort.key === "holder"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "holder"))} className="px-4 py-3" />
              <SortTh label="Tool" active={sort.key === "tool"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "tool"))} />
              <th>Plan</th>
              <SortTh label="Status" active={sort.key === "status"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "status"))} />
              <SortTh label="Assigned" active={sort.key === "assigned_on"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "assigned_on"))} />
              <SortTh label="Renewal" active={sort.key === "renewal_date"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "renewal_date"))} />
              <SortTh label="Kind" active={sort.key === "kind"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "kind"))} />
              <th className="text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3"><div className="font-medium text-slate-900">{r.holder_name || r.work_email || "Unassigned"}</div><div className="text-xs text-steel">{r.work_email || "No email"}</div></td>
                <td className="font-medium text-slate-800">{r.tool_short_name || r.tool_name}</td>
                <td>{r.plan || "—"}</td>
                <td><StatusSelect value={r.status} onChange={(status) => onPatch(r.id, { status })} /></td>
                <td>{formatDate(r.assigned_on)}</td>
                <td><RenewalCell value={r.renewal_date} /></td>
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
  sort: { key: ContractSortKey; dir: SortDir };
  setSort: (sort: { key: ContractSortKey; dir: SortDir }) => void;
  toolOptions: ToolOption[];
}) {
  const { rows, form, setForm, saving, onCreate, onPatch, onDelete, sort, setSort, toolOptions } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyContract);

  const beginEdit = (row: LicenseContractItem) => {
    setEditingId(row.id);
    setEditForm({
      contract_key: row.contract_key || "",
      software: row.software || "",
      category: row.category || "",
      entity: row.entity || "",
      seats: String(row.seats ?? 0),
      vendor: row.vendor || "",
      start_date: row.start_date || "",
      end_date: row.end_date || "",
      cost: row.cost == null ? "" : String(row.cost),
      currency: row.currency || "INR",
      status: row.status || "Active",
      notes: row.notes || "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await onPatch(editingId, cleanPayload({
      ...editForm,
      seats: Number(editForm.seats || 0),
      cost: editForm.cost ? Number(editForm.cost) : null,
    }));
    setEditingId(null);
    setEditForm(emptyContract);
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1.2fr)_110px_minmax(180px,1fr)_150px_120px_130px]">
          <Input list="license-tool-options-contracts" value={form.software} placeholder="software" onChange={(v) => setForm({ ...form, software: v })} />
          <Input value={form.seats} placeholder="seats" onChange={(v) => setForm({ ...form, seats: v })} />
          <Input value={form.vendor} placeholder="vendor optional" onChange={(v) => setForm({ ...form, vendor: v })} />
          <Input type="date" value={form.end_date} placeholder="renewal" onChange={(v) => setForm({ ...form, end_date: v })} />
          <Input value={form.cost} placeholder="cost" onChange={(v) => setForm({ ...form, cost: v })} />
          <button disabled={saving || !form.software.trim()} onClick={onCreate} className="rounded-xl bg-[var(--brand-color)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Add Contract</button>
        </div>
        <datalist id="license-tool-options-contracts">
          {toolOptions.map((option) => <option key={option.label} value={option.label} />)}
        </datalist>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1060px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Contract</th>
              <SortTh label="Software" active={sort.key === "software"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "software"))} />
              <SortTh label="Vendor" active={sort.key === "vendor"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "vendor"))} />
              <SortTh label="Seats" active={sort.key === "seats"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "seats"))} />
              <SortTh label="Cost" active={sort.key === "cost"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "cost"))} />
              <SortTh label="End Date" active={sort.key === "end_date"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "end_date"))} />
              <SortTh label="Renewal" active={sort.key === "renewal"} dir={sort.dir} onClick={() => setSort(nextSort(sort, "renewal"))} />
              <th className="text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-3"><div className="font-medium text-slate-900">{r.contract_key}</div><div className="text-xs text-steel">{r.entity || "Entity not set"}</div></td>
                  <td>{r.short_name || r.software}</td>
                  <td>{r.vendor || "—"}</td>
                  <td><InlineNumber value={r.seats} onSave={(seats) => onPatch(r.id, { seats })} /></td>
                  <td>{r.cost != null ? `${r.currency} ${Math.round(r.cost).toLocaleString("en-IN")}` : "—"}</td>
                  <td>{formatDate(r.end_date)}</td>
                  <td><RenewalBadge status={r.renewal_status} days={r.days_to_expiry} /></td>
                  <td className="pr-4 text-right">
                    <button onClick={() => beginEdit(r)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                    <button onClick={() => onDelete(r.id)} className="ml-2 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Delete</button>
                  </td>
                </tr>
                {editingId === r.id ? (
                  <tr className="border-t border-slate-100 bg-slate-50/80">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="grid gap-2 lg:grid-cols-[1fr_1fr_1fr_120px_150px_120px]">
                        <Input value={editForm.software} placeholder="software" onChange={(v) => setEditForm({ ...editForm, software: v })} />
                        <Input value={editForm.vendor} placeholder="vendor" onChange={(v) => setEditForm({ ...editForm, vendor: v })} />
                        <Input value={editForm.entity} placeholder="entity" onChange={(v) => setEditForm({ ...editForm, entity: v })} />
                        <Input value={editForm.seats} placeholder="seats" onChange={(v) => setEditForm({ ...editForm, seats: v })} />
                        <Input type="date" value={editForm.end_date} placeholder="renewal" onChange={(v) => setEditForm({ ...editForm, end_date: v })} />
                        <Input value={editForm.cost} placeholder="cost" onChange={(v) => setEditForm({ ...editForm, cost: v })} />
                      </div>
                      <div className="mt-2 grid gap-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
                        <Input value={editForm.contract_key} placeholder="contract key" onChange={(v) => setEditForm({ ...editForm, contract_key: v })} />
                        <Input value={editForm.category} placeholder="category" onChange={(v) => setEditForm({ ...editForm, category: v })} />
                        <Input type="date" value={editForm.start_date} placeholder="start date" onChange={(v) => setEditForm({ ...editForm, start_date: v })} />
                        <Input value={editForm.status} placeholder="status" onChange={(v) => setEditForm({ ...editForm, status: v })} />
                        <button onClick={saveEdit} className="rounded-xl bg-[var(--brand-color)] px-3 py-2 text-xs font-semibold text-white">Save</button>
                        <button onClick={() => setEditingId(null)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {!rows.length ? <tr><td colSpan={8}><EmptyState label="No contracts match the current filters." /></td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
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
        <div className={`h-full ${pct > 95 ? "bg-red-500" : pct < 65 ? "bg-amber-500" : "bg-[var(--brand-color)]"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex justify-between text-xs text-steel">
        <span>People {item.assigned}</span>
        <span>Shared {item.shared_assigned}</span>
      </div>
    </div>
  );
}

function SortTh({ label, active, dir, onClick, className = "" }: { label: string; active: boolean; dir: SortDir; onClick: () => void; className?: string }) {
  return (
    <th className={className}>
      <button onClick={onClick} className="inline-flex items-center gap-1 text-left font-semibold uppercase tracking-wide hover:text-slate-900">
        {label}
        <span className={`text-[10px] ${active ? "text-[var(--brand-color)]" : "text-slate-300"}`}>{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function FilterSelect({ value, onChange, label, options, labels }: { value: string; onChange: (value: string) => void; label: string; options: string[]; labels?: Record<string, string> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
      <option value="">{label}</option>
      {options.map((option) => <option key={option} value={option}>{labels?.[option] || option}</option>)}
    </select>
  );
}

function Input({ value, onChange, placeholder, type = "text", list }: { value: string; onChange: (value: string) => void; placeholder: string; type?: string; list?: string }) {
  return <input list={list} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400" />;
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

function HolderKind({ kind }: { kind: LicenseHolderKind }) {
  const cls = kind === "person" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : kind === "unassigned" ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700";
  const label = kind === "person" ? "Person" : kind === "shared" ? "Shared" : "Unassigned";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function RenewalCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const days = daysUntil(value);
  if (days == null || days > 60) return <span>{formatDate(value)}</span>;
  return <span className={days < 0 ? "font-semibold text-red-700" : "font-semibold text-amber-700"}>{formatDate(value)}</span>;
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

function nextSort<T extends string>(current: { key: T; dir: SortDir }, key: T) {
  return { key, dir: current.key === key && current.dir === "asc" ? "desc" as SortDir : "asc" as SortDir };
}

function sortRows<T, K extends string>(rows: T[], sort: { key: K; dir: SortDir }, valueFor: (row: T, key: K) => string | number | null) {
  return [...rows].sort((a, b) => {
    const left = valueFor(a, sort.key);
    const right = valueFor(b, sort.key);
    const cmp = compareValues(left, right);
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

function assignmentSortValue(row: LicenseAssignmentItem, key: AssignmentSortKey) {
  if (key === "holder") return row.holder_name || row.work_email;
  if (key === "tool") return row.tool_short_name || row.tool_name;
  if (key === "kind") return row.holder_kind;
  return row[key] || null;
}

function contractSortValue(row: LicenseContractItem, key: ContractSortKey) {
  if (key === "software") return row.short_name || row.software;
  if (key === "renewal") return row.days_to_expiry;
  return row[key] || null;
}

function compareValues(left: string | number | null, right: string | number | null) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function compareNullableDate(left: string, right: string) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function findToolOption(options: ToolOption[], value: string) {
  const normalized = value.trim().toLowerCase();
  return options.find((option) => option.label.toLowerCase() === normalized || option.software.toLowerCase() === normalized);
}

function makeContractKey(form: typeof emptyContract) {
  const base = [form.software, form.vendor, form.end_date].filter(Boolean).join("-") || "license";
  return `${base}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

function isActive(status: string) {
  return !["revoked", "available", "unassigned", "inactive", "disabled"].includes(status.trim().toLowerCase());
}

function daysUntil(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((time - today.getTime()) / 86400000);
}
