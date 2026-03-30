"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  Database,
  Download,
  Eye,
  Filter,
  LayoutPanelLeft,
  RefreshCw,
  Search,
  TableProperties,
} from "lucide-react";
import type { ReportColumn, ReportMeta, ReportPreview } from "@/lib/types";
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

type ColumnGroup = {
  id: string;
  label: string;
  columns: ReportColumn[];
};

const defaultFilters: FiltersState = {
  dateFrom: "",
  dateTo: "",
  openingId: "",
  status: "",
  isActive: "",
  limit: "50",
};

const COLUMN_GROUP_ORDER = [
  "candidate",
  "opening",
  "workflow",
  "screening",
  "interviews",
  "offer",
  "joining",
  "source",
  "timeline",
  "other",
] as const;

const COLUMN_GROUP_LABELS: Record<(typeof COLUMN_GROUP_ORDER)[number], string> = {
  candidate: "Candidate Details",
  opening: "Opening & Role",
  workflow: "Workflow & Status",
  screening: "Forms & Screening",
  interviews: "Interviews & Sprint",
  offer: "Offer & Compensation",
  joining: "Joining & Documents",
  source: "Source & Ownership",
  timeline: "Dates & Activity",
  other: "Other Fields",
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

  const deferredColumnSearch = useDeferredValue(columnSearch);

  const activeReport = useMemo(
    () => reports.find((report) => report.report_id === selectedReportId) || null,
    [reports, selectedReportId]
  );

  const defaultColumnSet = useMemo(
    () => new Set(activeReport?.default_columns || []),
    [activeReport]
  );

  const columnLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    (activeReport?.columns || []).forEach((column) => {
      map.set(column.key, column.label);
    });
    return map;
  }, [activeReport]);

  const orderedColumns = useMemo(() => {
    if (!activeReport) return [];
    return activeReport.columns.map((col) => col.key).filter((key) => selectedColumns.has(key));
  }, [activeReport, selectedColumns]);

  const filteredColumns = useMemo(() => {
    if (!activeReport) return [];
    const query = deferredColumnSearch.trim().toLowerCase();
    if (!query) return activeReport.columns;
    return activeReport.columns.filter((col) => {
      const haystack = `${col.label} ${col.key}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activeReport, deferredColumnSearch]);

  const groupedColumns = useMemo(() => groupColumns(filteredColumns), [filteredColumns]);

  const selectedColumnLabels = useMemo(
    () => orderedColumns.map((key) => columnLabelMap.get(key) || key),
    [orderedColumns, columnLabelMap]
  );

  const activeFilterPills = useMemo(() => {
    const pills: Array<{ label: string; value: string }> = [];
    if (filters.dateFrom || filters.dateTo) {
      pills.push({
        label: "Date",
        value: filters.dateFrom && filters.dateTo ? `${filters.dateFrom} to ${filters.dateTo}` : filters.dateFrom || filters.dateTo,
      });
    }
    if (filters.openingId) pills.push({ label: "Opening", value: filters.openingId });
    if (filters.status) pills.push({ label: "Status", value: filters.status });
    if (filters.isActive) pills.push({ label: "Active", value: filters.isActive === "1" ? "Active only" : "Inactive only" });
    if (filters.limit) pills.push({ label: "Limit", value: filters.limit });
    return pills;
  }, [filters]);

  const previewInsights = useMemo(() => {
    if (!preview) return [];

    const rows = preview.rows;
    const statusTop = topValueByKeys(rows, ["status", "offer_status", "decision"]);
    const decisionTop = topValueByKeys(rows, ["final_decision", "decision", "offer_status"]);
    const uniqueOpenings = countUniqueByKeys(rows, ["opening_title", "opening_code", "opening_id"]);
    const withEmail = countRowsWithAnyValue(rows, ["email", "candidate_email"]);

    const insights: Array<{ label: string; value: string; hint?: string }> = [
      { label: "Visible rows", value: rows.length.toString(), hint: `of ${preview.total} total` },
      { label: "Selected columns", value: preview.columns.length.toString(), hint: `${selectedColumns.size} configured` },
      {
        label: "Email coverage",
        value: withEmail.toString(),
        hint: rows.length > 0 ? `${Math.round((withEmail / rows.length) * 100)}% of preview` : undefined,
      },
    ];

    if (uniqueOpenings > 0) insights.push({ label: "Openings", value: uniqueOpenings.toString() });
    if (statusTop) insights.push({ label: "Top status", value: statusTop.value, hint: `${statusTop.count} row(s)` });
    if (decisionTop) insights.push({ label: "Top decision", value: decisionTop.value, hint: `${decisionTop.count} row(s)` });
    return insights;
  }, [preview, selectedColumns.size]);

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
        setSelectedReportId(data.reports?.[0]?.report_id || "");
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
    setColumnSearch("");
    setPreview(null);
    setError(null);
  }, [activeReport]);

  useEffect(() => {
    if (!activeReport) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = buildParams(activeReport, orderedColumns, filters);
        const url = new URL(
          `${basePath}/api/rec/reports/${encodeURIComponent(activeReport.report_id)}/preview`,
          window.location.origin
        );
        params.forEach((value, key) => url.searchParams.set(key, value));
        const res = await fetchDeduped(url.toString(), { cache: "no-store", signal: controller.signal });
        if (!res.ok) {
          setError(await formatApiError(res));
          return;
        }
        const data = (await res.json()) as ReportPreview;
        if (!controller.signal.aborted) setPreview(data);
      } catch {
        if (!controller.signal.aborted) setError("Unable to load preview.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    activeReport,
    orderedColumns,
    filters,
  ]);

  function toggleColumn(key: string) {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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

  function clearFilters() {
    setFilters(defaultFilters);
  }

  async function refreshPreviewNow() {
    if (!activeReport) return;
    setLoading(true);
    setError(null);
    try {
      const params = buildParams(activeReport, orderedColumns, filters);
      const url = new URL(
        `${basePath}/api/rec/reports/${encodeURIComponent(activeReport.report_id)}/preview`,
        window.location.origin
      );
      params.forEach((value, key) => url.searchParams.set(key, value));
      const res = await fetchDeduped(url.toString(), { cache: "no-store", signal: new AbortController().signal });
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
    const params = buildParams(activeReport, orderedColumns, filters);
    const url = new URL(
      `${basePath}/api/rec/reports/${encodeURIComponent(activeReport.report_id)}/download`,
      window.location.origin
    );
    params.forEach((value, key) => url.searchParams.set(key, value));
    window.location.href = url.toString();
  }

  if (!canAccess) return null;

  return (
    <main className="content-pad grid gap-3 xl:grid-cols-[380px_minmax(0,1fr)] xl:grid-rows-[auto_minmax(0,1fr)] xl:h-full xl:min-h-0">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm xl:col-span-2">
        <div className="absolute -right-10 top-2 h-20 w-20 rounded-full bg-sky-200/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Reports Studio</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">Live reporting workspace</h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800">
            <Eye className="h-3.5 w-3.5" />
            Live preview updates with filters and column changes
          </div>
        </div>
      </section>
      <div className="space-y-3 xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden">
        <section className="section-card space-y-3 p-3 xl:shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-2xl bg-slate-900 p-2 text-white">
                <LayoutPanelLeft className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">Report library</p>
                <p className="text-[11px] text-slate-500">Choose the dataset and refine the slice.</p>
              </div>
            </div>
            {loadingMeta ? <span className="text-[11px] text-slate-500">Loading...</span> : null}
          </div>

          {loadingMeta ? (
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-500">
              Loading reports...
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-500">
              No reports found.
            </div>
          ) : (
            <div className="grid gap-1.5">
              {reports.map((report) => {
                const active = report.report_id === selectedReportId;
                return (
                  <button
                    key={report.report_id}
                    type="button"
                    onClick={() => setSelectedReportId(report.report_id)}
                    className={clsx(
                      "rounded-2xl border px-3 py-2 text-left transition",
                      active
                        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                        : "border-slate-200 bg-white/80 text-slate-700 hover:bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{report.label}</span>
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {report.columns.length} cols
                      </span>
                    </div>
                    <p className={clsx("mt-1 line-clamp-2 text-[11px]", active ? "text-slate-200" : "text-slate-500")}>
                      {report.description}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-900">Report filters</p>
                  <p className="text-[11px] text-slate-500">Compact strips for faster slicing.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-900"
                disabled={!activeReport}
              >
                Clear all
              </button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {activeReport?.filters.date_field ? (
                <>
                  <label className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">From</span>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">To</span>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </>
              ) : null}

              {activeReport?.filters.opening_id ? (
                <label className="space-y-1 sm:col-span-2 xl:col-span-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Opening ID</span>
                  <input
                    value={filters.openingId}
                    onChange={(e) => setFilters((prev) => ({ ...prev, openingId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="Optional opening id"
                  />
                </label>
              ) : null}

              {activeReport?.filters.status ? (
                <label className="space-y-1 sm:col-span-2 xl:col-span-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Status / Decision</span>
                  <input
                    value={filters.status}
                    onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="e.g. in_process, accepted"
                  />
                </label>
              ) : null}

              {activeReport?.filters.is_active ? (
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Active</span>
                  <select
                    value={filters.isActive}
                    onChange={(e) => setFilters((prev) => ({ ...prev, isActive: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">All</option>
                    <option value="1">Active only</option>
                    <option value="0">Inactive only</option>
                  </select>
                </label>
              ) : null}

              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Preview limit</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={filters.limit}
                  onChange={(e) => setFilters((prev) => ({ ...prev, limit: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {activeFilterPills.length ? (
                activeFilterPills.map((pill) => (
                  <span
                    key={`${pill.label}:${pill.value}`}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                  >
                    {pill.label}: {pill.value}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-slate-500">No filters applied.</span>
              )}
            </div>
          </div>
        </section>

        <section className="section-card p-3 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-2xl bg-slate-100 p-2 text-slate-700">
                <TableProperties className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">Column studio</p>
                <p className="text-[11px] text-slate-500">Candidate fields are organized first for faster selection.</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                onClick={resetColumns}
                disabled={!activeReport}
              >
                Default
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                onClick={selectAllColumns}
                disabled={!activeReport}
              >
                All
              </button>
            </div>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={columnSearch}
              onChange={(e) => setColumnSearch(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-10 py-2 text-sm"
              placeholder="Search candidate, opening, workflow, offer..."
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {COLUMN_GROUP_ORDER.map((groupId) => {
              const group = groupedColumns.find((item) => item.id === groupId);
              if (!group) return null;
              return (
                <span
                  key={groupId}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                >
                  {group.label} {group.columns.length}
                </span>
              );
            })}
          </div>

          <div className="mt-3 space-y-2 xl:min-h-0 xl:flex-1 xl:overflow-auto xl:pr-1">
            {groupedColumns.map((group) => (
              <div key={group.id} className="rounded-2xl border border-slate-200 bg-white/80 p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{group.label}</p>
                  <span className="text-[11px] text-slate-400">{group.columns.length} fields</span>
                </div>
                <div className="space-y-1">
                  {group.columns.map((col) => {
                    const checked = selectedColumns.has(col.key);
                    const recommended = defaultColumnSet.has(col.key);
                    return (
                      <label
                        key={col.key}
                        className={clsx(
                          "flex cursor-pointer items-start gap-2 rounded-xl px-2 py-1.5 transition",
                          checked ? "bg-slate-100" : "hover:bg-slate-50"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumn(col.key)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-800">{col.label}</span>
                          <span className="mt-0.5 inline-flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                            <span>{col.key}</span>
                            {recommended ? (
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                                Default
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
            <span>Selected {selectedColumns.size} / {activeReport?.columns.length || 0}</span>
            <span>{activeReport ? activeReport.label : "No dataset selected"}</span>
          </div>
        </section>
      </div>

      <section className="section-card p-0 xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="rounded-2xl bg-slate-900 p-2 text-white">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">{activeReport?.label || "No report selected"}</h2>
                <p className="text-[11px] text-slate-500">{activeReport?.description || "Choose a report from the library."}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {selectedColumnLabels.length ? (
                selectedColumnLabels.slice(0, 10).map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                  >
                    {label}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-slate-500">No columns selected.</span>
              )}
              {selectedColumnLabels.length > 10 ? (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  +{selectedColumnLabels.length - 10} more
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800">
              <Eye className="h-3.5 w-3.5" />
              {loading ? "Refreshing live preview..." : "Live preview on"}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => void refreshPreviewNow()}
              disabled={!activeReport || loading}
            >
              <RefreshCw className={clsx("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh now
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-950"
              onClick={downloadCsv}
              disabled={!activeReport}
            >
              <Download className="h-3.5 w-3.5" />
              Download CSV
            </button>
          </div>
        </div>

        {error ? <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div> : null}

        {previewInsights.length ? (
          <div className="grid gap-2 border-b border-slate-200 px-4 py-3 sm:grid-cols-2 2xl:grid-cols-5">
            {previewInsights.map((insight) => (
              <div key={insight.label} className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{insight.label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{insight.value}</p>
                {insight.hint ? <p className="text-[11px] text-slate-500">{insight.hint}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="min-h-[420px] px-4 py-4 xl:min-h-0 xl:flex-1 xl:overflow-hidden">
          {preview ? (
            <div className="h-full rounded-2xl border border-slate-200 bg-white/80 xl:flex xl:min-h-0 xl:flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-[11px] text-slate-500">
                <span>
                  Showing {preview.rows.length} of {preview.total} rows
                </span>
                <span>{preview.columns.length} visible columns</span>
              </div>
              <div className="overflow-auto xl:min-h-0 xl:flex-1">
                <table className="min-w-full text-left text-xs text-slate-700">
                  <thead className="sticky top-0 z-10 bg-white/95">
                    <tr>
                      {preview.columns.map((col) => (
                        <th key={col} className="border-b border-slate-200 px-3 py-2 align-bottom">
                          <div className="min-w-[160px]">
                            <p className="text-[11px] font-semibold text-slate-800">{columnLabelMap.get(col) || prettifyColumnKey(col)}</p>
                            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">{col}</p>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.length === 0 ? (
                      <tr>
                        <td colSpan={Math.max(1, preview.columns.length)} className="px-3 py-10 text-center text-slate-500">
                          No rows returned for the current filters.
                        </td>
                      </tr>
                    ) : (
                      preview.rows.map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                          {preview.columns.map((col) => (
                            <td key={col} className="max-w-[260px] px-3 py-2 align-top">
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
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 text-sm text-slate-500">
              {loading ? "Loading live preview..." : "Select a report to load the live preview."}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function buildParams(activeReport: ReportMeta, orderedColumns: string[], filters: FiltersState) {
  const params = new URLSearchParams();
  const columns = orderedColumns.length ? orderedColumns.join(",") : activeReport.default_columns.join(",");
  if (columns) params.set("columns", columns);
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (filters.openingId) params.set("opening_id", filters.openingId);
  if (filters.status) params.set("status", filters.status);
  if (filters.isActive) params.set("is_active", filters.isActive);
  if (filters.limit) params.set("limit", filters.limit);
  return params;
}

function classifyColumn(column: ReportColumn): (typeof COLUMN_GROUP_ORDER)[number] {
  const text = `${column.key} ${column.label}`.toLowerCase();

  if (/(candidate|first_name|last_name|full_name|email|phone|contact|city|education|qualification|experience|terms)/.test(text)) {
    return "candidate";
  }
  if (/(opening|designation|role|department|location|job_id|opening_code|title)/.test(text)) {
    return "opening";
  }
  if (/(status|decision|stage|workflow|owner|hired|rejected|declined|accepted)/.test(text)) {
    return "workflow";
  }
  if (/(screen|caf|basic_details|assessment|relocate|review)/.test(text)) {
    return "screening";
  }
  if (/(interview|l1|l2|sprint|feedback|reviewer|slot)/.test(text)) {
    return "interviews";
  }
  if (/(offer|ctc|salary|compensation|gross|fixed|variable|grade|currency|probation)/.test(text)) {
    return "offer";
  }
  if (/(joining|document|aadhaar|pan|profile|doc_)/.test(text)) {
    return "joining";
  }
  if (/(source|external|sheet|origin|ref|manager|requested_by|recruiter)/.test(text)) {
    return "source";
  }
  if (/(created|updated|submitted|sent|date|time|age|at)/.test(text)) {
    return "timeline";
  }
  return "other";
}

function groupColumns(columns: ReportColumn[]): ColumnGroup[] {
  const groups = new Map<string, ReportColumn[]>();
  columns.forEach((column) => {
    const id = classifyColumn(column);
    const current = groups.get(id) || [];
    current.push(column);
    groups.set(id, current);
  });

  return COLUMN_GROUP_ORDER
    .map((id) => ({
      id,
      label: COLUMN_GROUP_LABELS[id],
      columns: groups.get(id) || [],
    }))
    .filter((group) => group.columns.length > 0);
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

function prettifyColumnKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
        <a href={text} target="_blank" rel="noreferrer" className="font-medium text-sky-700 underline underline-offset-2">
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
    if (parsed && typeof parsed === "object" && "detail" in parsed && typeof (parsed as { detail?: unknown }).detail === "string") {
      return (parsed as { detail: string }).detail;
    }
  } catch {
    // ignore
  }
  return null;
}
