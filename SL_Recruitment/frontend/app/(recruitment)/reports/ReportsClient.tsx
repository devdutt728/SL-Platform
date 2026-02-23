"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReportMeta, ReportPreview } from "@/lib/types";
import { redirectToLogin } from "@/lib/auth-client";
import { fetchDeduped } from "@/lib/fetch-deduped";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

type FiltersState = {
  dateFrom: string;
  dateTo: string;
  openingId: string;
  status: string;
  isActive: string;
  limit: string;
};

const defaultFilters: FiltersState = {
  dateFrom: "",
  dateTo: "",
  openingId: "",
  status: "",
  isActive: "",
  limit: "50",
};

export default function ReportsClient({ canAccess }: { canAccess: boolean }) {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [columnSearch, setColumnSearch] = useState("");
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeReport = useMemo(
    () => reports.find((report) => report.report_id === selectedReportId) || null,
    [reports, selectedReportId]
  );

  const orderedColumns = useMemo(() => {
    if (!activeReport) return [];
    return activeReport.columns.map((col) => col.key).filter((key) => selectedColumns.has(key));
  }, [activeReport, selectedColumns]);

  useEffect(() => {
    let cancelled = false;
    if (!canAccess) {
      setLoadingMeta(false);
      return;
    }
    (async () => {
      try {
        const res = await fetchDeduped(`${basePath}/api/rec/reports`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError(await formatApiError(res));
          return;
        }
        const data = (await res.json()) as { reports: ReportMeta[] };
        if (cancelled) return;
        setReports(data.reports || []);
        const first = data.reports?.[0]?.report_id || "";
        setSelectedReportId(first);
      } catch {
        if (!cancelled) setError("Unable to load reports.");
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canAccess]);

  useEffect(() => {
    if (!activeReport) return;
    setSelectedColumns(new Set(activeReport.default_columns));
    setFilters(defaultFilters);
    setPreview(null);
    setError(null);
  }, [activeReport?.report_id]);

  const filteredColumns = useMemo(() => {
    if (!activeReport) return [];
    const query = columnSearch.trim().toLowerCase();
    if (!query) return activeReport.columns;
    return activeReport.columns.filter((col) => col.label.toLowerCase().includes(query) || col.key.includes(query));
  }, [activeReport, columnSearch]);

  function toggleColumn(key: string) {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function selectAllColumns() {
    if (!activeReport) return;
    setSelectedColumns(new Set(activeReport.columns.map((col) => col.key)));
  }

  function resetColumns() {
    if (!activeReport) return;
    setSelectedColumns(new Set(activeReport.default_columns));
  }

  function buildParams() {
    const params = new URLSearchParams();
    const columns = orderedColumns.length ? orderedColumns.join(",") : activeReport?.default_columns.join(",") || "";
    if (columns) params.set("columns", columns);
    if (filters.dateFrom) params.set("from", filters.dateFrom);
    if (filters.dateTo) params.set("to", filters.dateTo);
    if (filters.openingId) params.set("opening_id", filters.openingId);
    if (filters.status) params.set("status", filters.status);
    if (filters.isActive) params.set("is_active", filters.isActive);
    if (filters.limit) params.set("limit", filters.limit);
    return params;
  }

  async function loadPreview() {
    if (!activeReport) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const params = buildParams();
      const url = new URL(
        `${basePath}/api/rec/reports/${encodeURIComponent(activeReport.report_id)}/preview`,
        window.location.origin
      );
      params.forEach((value, key) => url.searchParams.set(key, value));
      const res = await fetchDeduped(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        setError(await formatApiError(res));
        return;
      }
      const data = (await res.json()) as ReportPreview;
      setPreview(data);
    } catch {
      setError("Unable to load preview.");
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    if (!activeReport) return;
    const params = buildParams();
    const url = new URL(
      `${basePath}/api/rec/reports/${encodeURIComponent(activeReport.report_id)}/download`,
      window.location.origin
    );
    params.forEach((value, key) => url.searchParams.set(key, value));
    window.location.href = url.toString();
  }

  if (!canAccess) return null;

  return (
    <main className="content-pad space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm motion-fade-up">
        <div className="absolute -right-10 top-8 h-40 w-40 rounded-full bg-sky-200/40 blur-3xl" aria-hidden="true" />
        <div className="absolute -left-8 bottom-6 h-28 w-28 rounded-full bg-cyan-200/40 blur-2xl" aria-hidden="true" />
        <div className="relative space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recruitment Intelligence</p>
          <h1 className="text-2xl font-semibold text-slate-900">Reports Studio</h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Configure high-fidelity reports, preview live data, and export CSVs in a controlled HR-only space.
          </p>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <section className="section-card space-y-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">Report library</p>
            <p className="text-sm text-slate-600">Pick a dataset and tune the columns for export.</p>
          </div>
          <div className="grid gap-3">
            {loadingMeta ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-500">Loading reports...</div>
            ) : reports.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-500">No reports found.</div>
            ) : (
              reports.map((report) => {
                const active = report.report_id === selectedReportId;
                return (
                  <button
                    key={report.report_id}
                    type="button"
                    onClick={() => setSelectedReportId(report.report_id)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                        : "border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-sm font-semibold ${active ? "text-white" : "text-slate-900"}`}>{report.label}</p>
                        <p className={`text-xs ${active ? "text-slate-200" : "text-slate-500"}`}>{report.description}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-wide ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
                        {report.columns.length} cols
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="section-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Configuration</p>
              <p className="text-sm text-slate-600">Filters, column selection, and CSV download.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
                onClick={resetColumns}
                disabled={!activeReport}
              >
                Default columns
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
                onClick={selectAllColumns}
                disabled={!activeReport}
              >
                All columns
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-slate-600">Report filters</span>
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 space-y-3">
                {activeReport?.filters.date_field ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">From</span>
                      <input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">To</span>
                      <input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                ) : null}

                {activeReport?.filters.opening_id ? (
                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">Opening ID</span>
                    <input
                      value={filters.openingId}
                      onChange={(e) => setFilters((prev) => ({ ...prev, openingId: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                      placeholder="Optional"
                    />
                  </label>
                ) : null}

                {activeReport?.filters.status ? (
                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">Status / Decision</span>
                    <input
                      value={filters.status}
                      onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                      placeholder="e.g. in_process, accepted"
                    />
                  </label>
                ) : null}

                {activeReport?.filters.is_active ? (
                  <label className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">Active</span>
                    <select
                      value={filters.isActive}
                      onChange={(e) => setFilters((prev) => ({ ...prev, isActive: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                    >
                      <option value="">All</option>
                      <option value="1">Active only</option>
                      <option value="0">Inactive only</option>
                    </select>
                  </label>
                ) : null}

                <label className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">Preview limit</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={filters.limit}
                    onChange={(e) => setFilters((prev) => ({ ...prev, limit: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </label>

            <label className="space-y-1">
              <span className="text-xs text-slate-600">Columns</span>
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 space-y-3">
                <input
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                  placeholder="Search columns"
                />
                <div className="max-h-64 space-y-2 overflow-auto pr-1">
                  {filteredColumns.map((col) => (
                    <label key={col.key} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedColumns.has(col.key)}
                        onChange={() => toggleColumn(col.key)}
                      />
                      <span className="truncate">{col.label}</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">{col.key}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  Selected {selectedColumns.size} / {activeReport?.columns.length || 0}
                </p>
              </div>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              {preview ? `Showing ${preview.rows.length} of ${preview.total} rows` : "Run a preview to inspect the data."}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                onClick={() => void loadPreview()}
                disabled={!activeReport || loading}
              >
                {loading ? "Loading..." : "Preview data"}
              </button>
              <button
                type="button"
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-950"
                onClick={downloadCsv}
                disabled={!activeReport}
              >
                Download CSV
              </button>
            </div>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          {preview ? (
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-3">
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full text-left text-xs text-slate-700">
                  <thead className="sticky top-0 bg-white/90 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      {preview.columns.map((col) => (
                        <th key={col} className="px-3 py-2 font-semibold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.length === 0 ? (
                      <tr>
                        <td colSpan={preview.columns.length} className="px-3 py-6 text-center text-slate-500">
                          No rows returned for the current filters.
                        </td>
                      </tr>
                    ) : (
                      preview.rows.map((row, idx) => (
                        <tr key={idx} className="border-t border-slate-100">
                          {preview.columns.map((col) => (
                            <td key={col} className="px-3 py-2">
                              {formatCell(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? value.toString() : "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function formatApiError(res: Response): Promise<string> {
  const raw = (await res.text()).trim();
  const detail = extractDetail(raw);
  if (res.status === 401) {
    redirectToLogin();
    return detail || "Session expired. Redirecting to login.";
  }
  if (res.status === 403) return detail || "Action not allowed.";
  return detail || raw || `Request failed (${res.status})`;
}

function extractDetail(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "detail" in parsed && typeof (parsed as any).detail === "string") {
      return (parsed as any).detail;
    }
  } catch {
    // ignore
  }
  return null;
}
