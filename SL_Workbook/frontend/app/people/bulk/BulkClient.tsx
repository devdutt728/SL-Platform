"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { pplGet } from "../_lib/client";
import type { ReconciliationIssue, ReconciliationResponse } from "../_lib/types";

const MODULES = ["People", "Org", "Groups", "Licenses", "Contracts", "Systems", "Peripherals"];
const SEVERITIES = ["critical", "warning", "info"];

export function BulkClient() {
  const [data, setData] = useState<ReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState("warning");
  const [module, setModule] = useState("Licenses");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    pplGet<ReconciliationResponse>("/bulk/reconciliation")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const matchesScope = useCallback((issue: ReconciliationIssue) => {
    if (module && issue.module !== module) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return searchableIssueValues(issue).some((value) => String(value || "").toLowerCase().includes(q));
  }, [module, search]);

  const scopedSeverityCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const issue of data?.issues || []) {
      if (!matchesScope(issue)) continue;
      if (issue.severity === "critical") counts.critical += 1;
      else if (issue.severity === "warning") counts.warning += 1;
      else if (issue.severity === "info") counts.info += 1;
    }
    return counts;
  }, [data, matchesScope]);

  const issues = useMemo(() => {
    return (data?.issues || []).filter((issue) => {
      if (severity && issue.severity !== severity) return false;
      return matchesScope(issue);
    });
  }, [data, matchesScope, severity]);

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="People" value={data?.summary.total_people} loading={loading} />
        <Metric label="Org Rows" value={data?.summary.org_people} loading={loading} />
        <Metric label="Systems" value={data?.summary.systems} loading={loading} />
        <Metric label="Licenses" value={data?.summary.active_license_assignments} loading={loading} />
        <Metric label="Peripherals" value={data?.summary.peripherals} loading={loading} />
        <Metric label="Issues" value={data?.summary.issue_count} loading={loading} tone={data?.summary.critical_count ? "risk" : undefined} />
      </section>

      <section className="public-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Bulk Modules</h2>
            <p className="mt-1 text-xs text-steel">Download/upload controls stay restricted to Superadmin and must use validate-preview-apply.</p>
          </div>
          <div className="flex gap-2">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API download endpoint, not app navigation. */}
            <a href="/api/ppl/bulk/export/current" className="rounded-xl bg-[var(--brand-color)] px-3 py-2 text-xs font-semibold text-white">
              Download Current Data
            </a>
            <button onClick={load} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Refresh
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {MODULES.map((name) => (
            <div key={name} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-sm font-semibold text-slate-900">{name}</p>
              <p className="mt-1 text-xs text-steel">Current-data export, template, upload, validation, preview, apply.</p>
              <span className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                Validate-first workflow
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="public-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Reconciliation</h2>
            <p className="mt-1 text-xs text-steel">Issues across People, Org, Groups, Licenses, Systems, and Peripherals.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SeverityPill label="Critical" value={scopedSeverityCounts.critical} active={severity === "critical"} onClick={() => setSeverity(severity === "critical" ? "" : "critical")} tone="critical" />
            <SeverityPill label="Warning" value={scopedSeverityCounts.warning} active={severity === "warning"} onClick={() => setSeverity(severity === "warning" ? "" : "warning")} tone="warning" />
            <SeverityPill label="Info" value={scopedSeverityCounts.info} active={severity === "info"} onClick={() => setSeverity(severity === "info" ? "" : "info")} tone="info" />
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(260px,1fr)_180px_180px_auto]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search person, email, system, issue, correction point"
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400"
          />
          <select value={module} onChange={(e) => setModule(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
            <option value="">All modules</option>
            {Array.from(new Set((data?.issues || []).map((issue) => issue.module))).sort().map((m) => <option key={m}>{m}</option>)}
          </select>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
            <option value="">All severities</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {search || module || severity ? (
            <button onClick={() => { setSearch(""); setModule(""); setSeverity(""); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Clear
            </button>
          ) : <div />}
        </div>

        <div className="mt-4 overflow-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1360px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Severity</th>
                <th>Module</th>
                <th>Entity</th>
                <th>Person</th>
                <th>Issue</th>
                <th>Where to Correct</th>
                <th>Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, index) => (
                <IssueRow key={`${issue.module}-${issue.entity_key}-${issue.issue}-${index}`} issue={issue} />
              ))}
              {!loading && !issues.length ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">No reconciliation issues match the current filters.</td></tr>
              ) : null}
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">Loading reconciliation…</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function searchableIssueValues(issue: ReconciliationIssue) {
  return [
    issue.module,
    issue.entity_key,
    issue.employee_no,
    issue.email,
    issue.name,
    issue.issue,
    issue.detail,
    issue.correction_point,
    issue.recommended_action,
  ];
}

function Metric({ label, value, loading, tone }: { label: string; value?: number; loading: boolean; tone?: "risk" }) {
  return (
    <div className={`rounded-2xl border bg-white p-4 ${tone === "risk" ? "border-red-200" : "border-slate-200"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-steel">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{loading ? "—" : value ?? 0}</p>
    </div>
  );
}

function SeverityPill({ label, value, active, onClick, tone }: { label: string; value: number; active: boolean; onClick: () => void; tone: "critical" | "warning" | "info" }) {
  const toneClass = tone === "critical" ? "border-red-200 text-red-700" : tone === "warning" ? "border-amber-200 text-amber-700" : "border-blue-200 text-blue-700";
  return (
    <button onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? "bg-[var(--brand-color)] text-white border-[var(--brand-color)]" : `bg-white ${toneClass}`}`}>
      {label} {value}
    </button>
  );
}

function IssueRow({ issue }: { issue: ReconciliationIssue }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3"><SeverityBadge severity={issue.severity} /></td>
      <td className="py-3 font-medium text-slate-800">{issue.module}</td>
      <td className="py-3">
        <div className="font-medium text-slate-900">{issue.entity_key}</div>
        <div className="text-xs text-steel">{issue.entity_type}</div>
      </td>
      <td className="py-3">
        <div className="font-medium text-slate-900">{issue.name || issue.employee_no || "—"}</div>
        <div className="text-xs text-steel">{issue.email || issue.employee_no || "No person link"}</div>
      </td>
      <td className="max-w-[360px] py-3">
        <div className="font-medium text-slate-900">{issue.issue}</div>
        <div className="mt-1 text-xs text-steel">{issue.detail}</div>
      </td>
      <td className="max-w-[360px] py-3 pr-4 text-xs text-slate-700">{issue.correction_point || "Review the entity row shown here."}</td>
      <td className="max-w-[320px] py-3 pr-4 text-xs text-slate-700">{issue.recommended_action}</td>
    </tr>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls = severity === "critical" ? "border-red-200 bg-red-50 text-red-700" : severity === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-200 bg-blue-50 text-blue-700";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>{severity}</span>;
}
