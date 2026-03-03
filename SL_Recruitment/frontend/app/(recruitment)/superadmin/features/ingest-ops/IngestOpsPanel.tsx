"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { AlertTriangle, Download, RefreshCcw, RotateCw, ShieldCheck } from "lucide-react";
import type {
  GoogleSheetIngestResult,
  IngestOpsDashboard,
  IngestOpsRow,
  IngestOpsRowsResponse,
  IngestOpsTimelineResponse,
} from "@/lib/types";
import { redirectToLogin } from "@/lib/auth-client";
import { STATE_FILTER_OPTIONS, STATUS_TONE, type StateFilter } from "./constants";
import { fmtHours, toLocal } from "./helpers";

type OpeningOption = {
  opening_id: number;
  title?: string | null;
  opening_code?: string | null;
};

type Props = {
  openings: OpeningOption[];
};

export function IngestOpsPanel({ openings }: Props) {
  const searchParams = useSearchParams();
  const [dashboard, setDashboard] = useState<IngestOpsDashboard | null>(null);
  const [rowsData, setRowsData] = useState<IngestOpsRowsResponse>({ total: 0, limit: 100, offset: 0, rows: [] });
  const [selected, setSelected] = useState<IngestOpsRow | null>(null);
  const [timeline, setTimeline] = useState<IngestOpsTimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<StateFilter>("all");
  const [openingId, setOpeningId] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [recruiter, setRecruiter] = useState("");
  const [minAgeHours, setMinAgeHours] = useState("");
  const [preflightJson, setPreflightJson] = useState('{\n  "sheet_name": "Master Data",\n  "rows": []\n}');
  const [preflightResult, setPreflightResult] = useState<GoogleSheetIngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attemptId = useMemo(() => {
    const raw = searchParams?.get("attempt_id");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }, [searchParams]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== "all") params.append("status", status);
    if (openingId) params.set("opening_id", openingId);
    if (sheetId) params.set("sheet_id", sheetId);
    if (batchId) params.set("batch_id", batchId);
    if (errorCode) params.set("error_code", errorCode);
    if (recruiter) params.set("recruiter", recruiter);
    if (minAgeHours) params.set("min_age_hours", minAgeHours);
    params.set("limit", "120");
    return params;
  }, [batchId, errorCode, minAgeHours, openingId, recruiter, sheetId, status]);

  async function fetchJson<T>(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    if (res.status === 401) {
      redirectToLogin();
      throw new Error("Unauthorized");
    }
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as T;
  }

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [dash, rows] = await Promise.all([
        fetchJson<IngestOpsDashboard>(`/api/rec/candidates/import/google-sheet/ops/dashboard?${query.toString()}`),
        fetchJson<IngestOpsRowsResponse>(`/api/rec/candidates/import/google-sheet/ops/rows?${query.toString()}`),
      ]);
      setDashboard(dash);
      setRowsData(rows);
      if (attemptId !== null) {
        const attemptRow = rows.rows.find((row) => row.candidate_ingest_attempt_id === attemptId);
        if (attemptRow) {
          setSelected(attemptRow);
          return;
        }
      }
      if (!selected || !rows.rows.some((row) => row.candidate_ingest_attempt_id === selected.candidate_ingest_attempt_id)) {
        setSelected(rows.rows[0] || null);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load ingest operations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, query.toString()]);

  useEffect(() => {
    if (!selected?.candidate_ingest_attempt_id) {
      setTimeline(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson<IngestOpsTimelineResponse>(
          `/api/rec/candidates/import/google-sheet/ops/rows/${selected.candidate_ingest_attempt_id}/timeline`
        );
        if (!cancelled) setTimeline(data);
      } catch {
        if (!cancelled) setTimeline(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.candidate_ingest_attempt_id]);

  async function runAction(key: string, fn: () => Promise<void>) {
    setActionBusy(key);
    setError(null);
    try {
      await fn();
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Action failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function retryRow(row: IngestOpsRow) {
    await runAction(`retry_${row.candidate_ingest_attempt_id}`, async () => {
      await fetchJson("/api/rec/candidates/import/google-sheet/ops/retry-row", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidate_ingest_attempt_id: row.candidate_ingest_attempt_id }),
      });
    });
  }

  async function markResolved(row: IngestOpsRow) {
    await runAction(`resolve_${row.candidate_ingest_attempt_id}`, async () => {
      await fetchJson("/api/rec/candidates/import/google-sheet/ops/mark-resolved", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidate_ingest_attempt_id: row.candidate_ingest_attempt_id, note: "Resolved by Super Admin." }),
      });
    });
  }

  async function retryTransient() {
    await runAction("retry_transient", async () => {
      await fetchJson("/api/rec/candidates/import/google-sheet/ops/retry-transient", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          limit: 50,
          opening_id: openingId ? Number(openingId) : null,
          sheet_id: sheetId || null,
          batch_id: batchId || null,
        }),
      });
    });
  }

  async function preflight() {
    await runAction("preflight", async () => {
      const parsed = JSON.parse(preflightJson || "{}");
      const result = await fetchJson<GoogleSheetIngestResult>("/api/rec/candidates/import/google-sheet/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...parsed, validate_only: true }),
      });
      setPreflightResult(result);
    });
  }

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (openingId) params.set("opening_id", openingId);
    if (sheetId) params.set("sheet_id", sheetId);
    if (batchId) params.set("batch_id", batchId);
    return `/api/rec/candidates/import/google-sheet/ops/export/failed?${params.toString()}`;
  }, [batchId, openingId, sheetId]);

  return (
    <section className="content-pad mt-4 space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Ingest Dashboard</p>
            <h2 className="text-lg font-semibold text-slate-900">Google Sheet Operations</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void retryTransient()}
              disabled={actionBusy === "retry_transient"}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry all transient
            </button>
            <a
              href={exportUrl}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export failed rows
            </a>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Success %</p>
            <p className="text-lg font-semibold text-emerald-700">{dashboard?.rates.success_pct ?? 0}%</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Duplicate %</p>
            <p className="text-lg font-semibold text-blue-700">{dashboard?.rates.duplicate_pct ?? 0}%</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Failed %</p>
            <p className="text-lg font-semibold text-rose-700">{dashboard?.rates.failed_pct ?? 0}%</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Retry Queue</p>
            <p className="text-lg font-semibold text-amber-700">{dashboard?.totals.retry_queue ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Time To Ingest</p>
            <p className="text-lg font-semibold text-slate-800">{fmtHours(dashboard?.slo.time_to_ingest_hours_avg)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Last Run</p>
            <p className="text-sm font-semibold text-slate-800">{toLocal(dashboard?.last_run_at)}</p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(dashboard?.alerts || []).map((alert) => (
            <div key={alert.kind} className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              {alert.message} ({alert.channels.join("/")})
            </div>
          ))}
          {dashboard && dashboard.alerts.length === 0 ? (
            <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              No active failure spike alerts
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value as StateFilter)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700">
            {STATE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select value={openingId} onChange={(e) => setOpeningId(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700">
            <option value="">All openings</option>
            {openings.map((opening) => (
              <option key={opening.opening_id} value={String(opening.opening_id)}>
                {(opening.title || opening.opening_code || `Opening ${opening.opening_id}`).slice(0, 72)}
              </option>
            ))}
          </select>
          <input value={sheetId} onChange={(e) => setSheetId(e.target.value)} placeholder="Sheet ID" className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700" />
          <input value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="Batch" className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700" />
          <input value={errorCode} onChange={(e) => setErrorCode(e.target.value)} placeholder="Error code" className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700" />
          <input value={recruiter} onChange={(e) => setRecruiter(e.target.value)} placeholder="Recruiter email" className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700" />
          <input value={minAgeHours} onChange={(e) => setMinAgeHours(e.target.value)} placeholder="Min age hours" className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700" />
        </div>
        {error ? <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</p> : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-2 py-2 text-left">Row</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">Error</th>
                <th className="px-2 py-2 text-left">Age</th>
                <th className="px-2 py-2 text-left">Last attempt</th>
                <th className="px-2 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rowsData.rows.map((row) => (
                <tr
                  key={row.candidate_ingest_attempt_id}
                  onClick={() => setSelected(row)}
                  className={clsx(
                    "cursor-pointer border-t border-slate-100 hover:bg-slate-50",
                    selected?.candidate_ingest_attempt_id === row.candidate_ingest_attempt_id ? "bg-blue-50/60" : ""
                  )}
                >
                  <td className="px-2 py-2">
                    <p className="font-semibold text-slate-900">{row.row_key || row.email_normalized}</p>
                    <p className="text-[11px] text-slate-500">{row.sheet_name || "-"} · {row.batch_id || "-"}</p>
                    <p className="text-[11px] text-slate-500">{row.email_normalized}</p>
                  </td>
                  <td className="px-2 py-2">
                    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[row.status])}>
                      {row.status.replace(/_/g, " ")}
                    </span>
                    {row.resolved_at ? <p className="mt-1 text-[11px] text-emerald-700">Resolved</p> : null}
                  </td>
                  <td className="px-2 py-2">
                    <p className="font-medium text-slate-700">{row.error_code || "-"}</p>
                    <p className="line-clamp-2 text-[11px] text-slate-500">{row.message || "-"}</p>
                  </td>
                  <td className="px-2 py-2 text-slate-700">{row.age_hours.toFixed(1)}h</td>
                  <td className="px-2 py-2 text-slate-700">{toLocal(row.last_attempt_at)}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void retryRow(row);
                        }}
                        disabled={Boolean(actionBusy)}
                        className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 disabled:opacity-60"
                      >
                        Retry row
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void markResolved(row);
                        }}
                        disabled={Boolean(actionBusy)}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 disabled:opacity-60"
                      >
                        Mark resolved
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rowsData.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-sm text-slate-500">
                    {loading ? "Loading..." : "No ingest rows found for selected filters."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Row Timeline</p>
            {!selected ? <p className="mt-2 text-xs text-slate-600">Select a row to see timeline and duplicate reason.</p> : null}
            {selected ? (
              <>
                <p className="mt-2 text-sm font-semibold text-slate-900">{selected.row_key || selected.email_normalized}</p>
                <p className="text-[11px] text-slate-500">First seen: {toLocal(selected.first_seen_at)}</p>
                <p className="text-[11px] text-slate-500">Retry count: {selected.retry_count}</p>
                <p className="mt-1 text-[11px] text-slate-600">{selected.resolution_hint || "-"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.candidate_id ? (
                    <Link href={`/candidates/${selected.candidate_id}`} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                      Candidate profile
                    </Link>
                  ) : null}
                  <Link
                    href={`/superadmin/ingest-ops?attempt_id=${selected.candidate_ingest_attempt_id}`}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Attempt history
                  </Link>
                </div>
              </>
            ) : null}
            {timeline?.duplicate_panel ? (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-2">
                <p className="text-[11px] font-semibold text-blue-800">Why duplicate?</p>
                <p className="text-[11px] text-blue-800">Matching key: {timeline.duplicate_panel.matching_key || "-"}</p>
                <p className="text-[11px] text-blue-800">External ref: {timeline.duplicate_panel.external_source_ref || "-"}</p>
                <p className="text-[11px] text-blue-800">Email/opening: {timeline.duplicate_panel.email_normalized || "-"} / {timeline.duplicate_panel.opening_id || "-"}</p>
              </div>
            ) : null}
            <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white">
              {(timeline?.timeline || []).map((item) => (
                <div key={item.candidate_ingest_attempt_id} className="border-b border-slate-100 px-2 py-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className={clsx("rounded-full px-2 py-0.5 font-semibold", STATUS_TONE[item.ingest_state])}>
                      {item.ingest_state.replace(/_/g, " ")}
                    </span>
                    <span className="text-slate-500">{toLocal(item.attempted_at)}</span>
                  </div>
                  <p className="mt-1 text-slate-700">{item.message || "-"}</p>
                  <p className="text-slate-500">By: {item.triggered_by_email || "-"}</p>
                </div>
              ))}
              {timeline && timeline.timeline.length === 0 ? <p className="px-2 py-2 text-[11px] text-slate-500">No timeline entries.</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Preflight (Validate only)</p>
            <textarea
              value={preflightJson}
              onChange={(e) => setPreflightJson(e.target.value)}
              className="mt-2 h-36 w-full rounded-lg border border-slate-200 p-2 font-mono text-[11px] text-slate-700"
            />
            <button
              type="button"
              onClick={() => void preflight()}
              disabled={actionBusy === "preflight"}
              className="mt-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Run validate-only
            </button>
            {preflightResult ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                <p>Rows: {preflightResult.requested_rows}</p>
                <p>Created: {preflightResult.created_count} · Duplicate: {preflightResult.duplicate_count} · Failed: {preflightResult.failed_count}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
