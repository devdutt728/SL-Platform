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

  const previewInsights = useMemo(() => {
    if (!preview) return [];

    const rows = preview.rows;
    const statusTop = topValueByKeys(rows, ["status", "offer_status", "decision"]);
    const decisionTop = topValueByKeys(rows, ["final_decision", "decision", "offer_status"]);
    const uniqueOpenings = countUniqueByKeys(rows, ["opening_title", "opening_code", "opening_id"]);
    const withEmail = countRowsWithAnyValue(rows, ["email", "candidate_email"]);

    const insights: Array<{ label: string; value: string; hint?: string }> = [
      {
        label: "Preview rows",
        value: rows.length.toString(),
        hint: `of ${preview.total} total`,
      },
      {
        label: "Rows with email",
        value: withEmail.toString(),
        hint: rows.length > 0 ? `${Math.round((withEmail / rows.length) * 100)}% coverage` : undefined,
      },
    ];

    if (uniqueOpenings > 0) {
      insights.push({
        label: "Unique openings",
        value: uniqueOpenings.toString(),
      });
    }
    if (statusTop) {
      insights.push({
        label: "Top status",
        value: statusTop.value,
        hint: `${statusTop.count} row(s)`,
      });
    }
    if (decisionTop) {
      insights.push({
        label: "Top decision",
        value: decisionTop.value,
        hint: `${decisionTop.count} row(s)`,
      });
    }
    return insights;
  }, [preview]);

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
    <main className="content-pad space-y-2 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:gap-2 xl:space-y-0 xl:overflow-hidden">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 p-3 shadow-sm motion-fade-up xl:shrink-0">
        <div className="absolute -right-10 top-2 h-16 w-16 rounded-full bg-sky-200/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-1.5">
          <h1 className="text-lg font-semibold text-slate-900">Reports Studio</h1>
          <p className="text-[11px] text-slate-500">High-density reporting workspace</p>
        </div>
      </section>

      <section className="section-card space-y-2 p-3 xl:shrink-0">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Report library</p>
            {loadingMeta ? (
              <div className="mt-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-1.5 text-sm text-slate-500">
                Loading reports...
              </div>
            ) : reports.length === 0 ? (
              <div className="mt-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-1.5 text-sm text-slate-500">
                No reports found.
              </div>
            ) : (
              <select
                value={selectedReportId}
                onChange={(e) => setSelectedReportId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-sm text-slate-800"
              >
                {reports.map((report) => (
                  <option key={report.report_id} value={report.report_id}>
                    {report.label} ({report.columns.length} cols)
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="min-w-[200px] flex-1 text-xs leading-tight text-slate-600">
            <p className="font-semibold text-slate-800">{activeReport?.label || "No report selected"}</p>
            <p className="truncate">{activeReport?.description || "Select a report dataset to begin."}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
              onClick={resetColumns}
              disabled={!activeReport}
            >
              Default columns
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
              onClick={selectAllColumns}
              disabled={!activeReport}
            >
              All columns
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white/80 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
              onClick={() => void loadPreview()}
              disabled={!activeReport || loading}
            >
              {loading ? "Loading..." : "Preview data"}
            </button>
            <button
              type="button"
              className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-950"
              onClick={downloadCsv}
              disabled={!activeReport}
            >
              Download CSV
            </button>
          </div>
        </div>
      </section>

      <section className="section-card space-y-2 p-3 xl:shrink-0">
        <div className="grid gap-2 xl:grid-cols-[1.85fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white/70 p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Report filters</p>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-5">
              {activeReport?.filters.date_field ? (
                <>
                  <label className="space-y-1 xl:col-span-1">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">From</span>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 xl:col-span-1">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">To</span>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm"
                    />
                  </label>
                </>
              ) : null}

              {activeReport?.filters.opening_id ? (
                <label className="space-y-1 xl:col-span-1">
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
                <label className="space-y-1 xl:col-span-1">
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
                <label className="space-y-1 xl:col-span-1">
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

              <label className="space-y-1 xl:col-span-1">
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
          </div>

          <div className="rounded-xl border border-slate-200 bg-white/70 p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Columns</p>
            <input
              value={columnSearch}
              onChange={(e) => setColumnSearch(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-1.5 text-sm"
              placeholder="Search columns"
            />
            <div className="mt-1.5 max-h-28 space-y-1 overflow-auto pr-1">
              {filteredColumns.map((col) => (
                <label key={col.key} className="flex items-center gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={selectedColumns.has(col.key)} onChange={() => toggleColumn(col.key)} />
                  <span className="truncate">{col.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">{col.key}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Selected {selectedColumns.size} / {activeReport?.columns.length || 0}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>{preview ? `Showing ${preview.rows.length} of ${preview.total} rows` : "Run preview to load table data."}</span>
          <span>{activeReport ? `Dataset: ${activeReport.label}` : "No dataset selected"}</span>
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      </section>

      <section className="section-card p-2 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-hidden">
        {preview ? (
          <div className="space-y-2 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
            {previewInsights.length ? (
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-5 xl:shrink-0">
                {previewInsights.map((insight) => (
                  <div key={insight.label} className="rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">{insight.label}</p>
                    <p className="text-xs font-semibold text-slate-900">{insight.value}</p>
                    {insight.hint ? <p className="text-[11px] text-slate-500">{insight.hint}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-200 bg-white/70 xl:min-h-0 xl:flex-1 xl:overflow-auto">
              <div className="max-h-[500px] overflow-auto xl:h-full xl:max-h-none">
                <table className="min-w-full text-left text-xs text-slate-700">
                  <thead className="sticky top-0 bg-white/95 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      {preview.columns.map((col) => (
                        <th key={col} className="px-2.5 py-2 font-semibold">
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
                        <tr key={idx} className="border-t border-slate-100 align-top">
                          {preview.columns.map((col) => (
                            <td key={col} className="max-w-[380px] px-2.5 py-1.5 align-top">
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
          </div>
        ) : (
          <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/60 text-sm text-slate-500">
            Run preview to load report rows.
          </div>
        )}
      </section>
    </main>
  );
}

function readTextValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function pickTextByKeys(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = readTextValue(row[key]);
    if (value) return value;
  }
  return "";
}

function countUniqueByKeys(rows: Record<string, unknown>[], keys: string[]): number {
  const values = new Set<string>();
  rows.forEach((row) => {
    const value = pickTextByKeys(row, keys);
    if (value) values.add(value);
  });
  return values.size;
}

function countRowsWithAnyValue(rows: Record<string, unknown>[], keys: string[]): number {
  return rows.reduce((count, row) => (pickTextByKeys(row, keys) ? count + 1 : count), 0);
}

function topValueByKeys(
  rows: Record<string, unknown>[],
  keys: string[]
): { value: string; count: number } | null {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const value = pickTextByKeys(row, keys);
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  let best: { value: string; count: number } | null = null;
  counts.forEach((count, value) => {
    if (!best || count > best.count) best = { value, count };
  });
  return best;
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isLikelyIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? value.toString() : "";
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return "";
    if (isLikelyUrl(text)) {
      return (
        <a href={text} target="_blank" rel="noreferrer" className="text-sky-700 underline underline-offset-2">
          Open link
        </a>
      );
    }
    if (isLikelyIsoDateTime(text)) {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime())) {
        return (
          <time dateTime={text} title={text}>
            {DATE_TIME_FORMATTER.format(parsed)}
          </time>
        );
      }
    }
    if (text.length > 120) {
      return <span title={text}>{`${text.slice(0, 117)}...`}</span>;
    }
    return text;
  }
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
