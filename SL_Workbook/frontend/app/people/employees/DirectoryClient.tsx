"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  type ColumnDef,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { pplGet, exportUrl } from "../_lib/client";
import type { EmployeeListItem, EmployeeListResponse } from "../_lib/types";
import { STATUS_STYLES, formatDate, initialsFrom } from "../_lib/format";

const STATUS_FILTERS = ["working", "relieved", "all"] as const;
const WORKER_FILTERS = ["", "permanent", "intern", "contract", "trainee"] as const;
const PAGE_LIMIT = 200;
const COLUMN_PREF_KEY = "ppl.directory.columns";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function DirectoryClient() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("working");
  const [workerType, setWorkerType] = useState<string>("");
  const [department, setDepartment] = useState<string>("");
  const [businessUnit, setBusinessUnit] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);

  const [rows, setRows] = useState<EmployeeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // Restore column prefs.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_PREF_KEY);
      if (raw) setColumnVisibility(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify(columnVisibility));
    } catch {
      /* ignore */
    }
  }, [columnVisibility]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ status, page: "1", limit: String(PAGE_LIMIT) });
    if (workerType) qs.set("worker_type", workerType);
    if (department) qs.set("department", department);
    if (businessUnit) qs.set("business_unit", businessUnit);
    if (search.trim()) qs.set("search", search.trim());

    pplGet<EmployeeListResponse>(`/employees?${qs.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setRows(data.items);
        setTotal(data.total);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, workerType, department, businessUnit, search]);

  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department).filter(Boolean))).sort() as string[],
    [rows],
  );
  const units = useMemo(
    () => Array.from(new Set(rows.map((r) => r.business_unit).filter(Boolean))).sort() as string[],
    [rows],
  );

  const columns = useMemo<ColumnDef<EmployeeListItem>[]>(
    () => [
      {
        id: "avatar",
        header: "",
        cell: ({ row }) => (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-color)]/10 text-[11px] font-semibold text-[var(--brand-color)]">
            {initialsFrom(row.original.full_name, row.original.employee_number)}
          </div>
        ),
      },
      { accessorKey: "employee_number", header: "Emp #" },
      {
        id: "full_name",
        header: "Full Name",
        cell: ({ row }) => (
          <Link href={`/people/employees/${row.original.id}`} className="font-medium text-slate-900 hover:text-[var(--brand-color)] hover:underline">
            {row.original.full_name || row.original.display_name || "—"}
          </Link>
        ),
      },
      { accessorKey: "department", header: "Department", cell: (c) => c.getValue() || "—" },
      { accessorKey: "job_title", header: "Job Title", cell: (c) => c.getValue() || "—" },
      { accessorKey: "business_unit", header: "Business Unit", cell: (c) => c.getValue() || "—" },
      { accessorKey: "worker_type", header: "Worker Type", cell: (c) => c.getValue() || "—" },
      {
        accessorKey: "employment_status",
        header: "Status",
        cell: ({ getValue }) => {
          const v = String(getValue() || "");
          return (
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[v] || STATUS_STYLES.relieved}`}>
              {v}
            </span>
          );
        },
      },
      { id: "date_joined", header: "Joined", cell: ({ row }) => formatDate(row.original.date_joined) },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  const exportHref = exportUrl({ status, worker_type: workerType, department, business_unit: businessUnit, search: search.trim() });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${status === s ? "bg-[var(--brand-color)] text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {s}
            </button>
          ))}
        </div>

        <select value={workerType} onChange={(e) => setWorkerType(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
          {WORKER_FILTERS.map((w) => (
            <option key={w} value={w}>{w ? w[0].toUpperCase() + w.slice(1) : "All worker types"}</option>
          ))}
        </select>

        <select value={department} onChange={(e) => setDepartment(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>

        <select value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
          <option value="">All units</option>
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>

        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name, email, emp #"
          className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400"
        />

        <ColumnToggle table={table} />

        <a href={exportHref} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
          Export Excel
        </a>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{loading ? "Loading…" : `${total} employee${total === 1 ? "" : "s"}`}</span>
        {total > PAGE_LIMIT ? <span>Showing first {PAGE_LIMIT}. Refine filters to narrow.</span> : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Virtualized table */}
      <div ref={parentRef} className="max-h-[68vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-4 py-3">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && <tr><td style={{ height: paddingTop }} colSpan={columns.length} /></tr>}
            {virtualRows.map((vr) => {
              const row = tableRows[vr.index];
              return (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50" style={{ height: 52 }}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2 text-slate-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 && <tr><td style={{ height: paddingBottom }} colSpan={columns.length} /></tr>}
            {!loading && tableRows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-400">No employees match these filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColumnToggle({ table }: { table: ReturnType<typeof useReactTable<EmployeeListItem>> }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
        Columns
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        {table.getAllLeafColumns().filter((c) => c.id !== "avatar").map((col) => (
          <label key={col.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
            <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()} />
            {typeof col.columnDef.header === "string" ? col.columnDef.header : col.id}
          </label>
        ))}
      </div>
    </details>
  );
}
