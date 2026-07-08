"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { pplGet, exportUrl } from "../_lib/client";
import type { EmployeeListItem, EmployeeListResponse, MeResponse } from "../_lib/types";
import { STATUS_STYLES, formatDate, initialsFrom } from "../_lib/format";
import {
  ColumnToggle,
  FilterBar,
  FilterSelect,
  GroupedTable,
  GroupMetaStat,
  ResetFiltersButton,
  SavedViewsMenu,
  SearchInput,
  SegmentedControl,
  VIEW_OPTIONS,
  useDebounced,
  usePersistentColumns,
} from "../_components/data";

const STATUS_FILTERS = [
  { value: "working", label: "Working" },
  { value: "relieved", label: "Relieved" },
  { value: "all", label: "All" },
];
const WORKER_OPTIONS = ["permanent", "intern", "contract", "trainee"];
const WORKER_LABELS: Record<string, string> = { permanent: "Permanent", intern: "Intern", contract: "Contract", trainee: "Trainee" };
const PAGE_LIMIT = 200;
const COLUMN_PREF_KEY = "ppl.directory.columns";

type DirectoryFilterSnapshot = {
  status: string;
  workerType: string;
  department: string;
  businessUnit: string;
  search: string;
  view: string;
};

export function DirectoryClient() {
  const [status, setStatus] = useState<string>("working");
  const [workerType, setWorkerType] = useState<string>("");
  const [department, setDepartment] = useState<string>("");
  const [businessUnit, setBusinessUnit] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  const [view, setView] = useState<string>("table");

  const [rows, setRows] = useState<EmployeeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = usePersistentColumns(COLUMN_PREF_KEY, {});
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    pplGet<MeResponse>("/auth/me").then(setMe).catch(() => {});
  }, []);

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
        enableSorting: false,
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
        accessorFn: (row) => row.full_name || row.display_name || "",
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
      { id: "date_joined", header: "Joined", accessorFn: (row) => row.date_joined || "", cell: ({ row }) => formatDate(row.original.date_joined) },
    ],
    [],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table intentionally returns table callbacks.
  const table = useReactTable({
    data: rows,
    columns,
    state: { columnVisibility, sorting },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
  const colCount = table.getVisibleLeafColumns().length;

  const exportHref = exportUrl({ status, worker_type: workerType, department, business_unit: businessUnit, search: search.trim() });
  const hasFilters = Boolean(searchInput || workerType || department || businessUnit || status !== "working");

  function resetFilters() {
    setStatus("working");
    setWorkerType("");
    setDepartment("");
    setBusinessUnit("");
    setSearchInput("");
  }

  const filterSnapshot: DirectoryFilterSnapshot = { status, workerType, department, businessUnit, search: searchInput, view };

  function applyFilterSnapshot(v: DirectoryFilterSnapshot) {
    setStatus(v.status ?? "working");
    setWorkerType(v.workerType ?? "");
    setDepartment(v.department ?? "");
    setBusinessUnit(v.businessUnit ?? "");
    setSearchInput(v.search ?? "");
    setView(v.view ?? "table");
  }

  return (
    <div className="space-y-4">
      <FilterBar>
        <SegmentedControl value={status} onChange={setStatus} options={STATUS_FILTERS} />
        <FilterSelect value={workerType} onChange={setWorkerType} label="All worker types" options={WORKER_OPTIONS} labels={WORKER_LABELS} />
        <FilterSelect value={department} onChange={setDepartment} label="All departments" options={departments} />
        <FilterSelect value={businessUnit} onChange={setBusinessUnit} label="All units" options={units} />
        <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search name, email, emp #" className="min-w-[220px] flex-1" />
        <SegmentedControl value={view} onChange={setView} options={VIEW_OPTIONS} />
        <ColumnToggle table={table} exclude={["avatar"]} />
        <SavedViewsMenu storageKey="ppl.directory.views" currentValues={filterSnapshot} onApply={applyFilterSnapshot} />
        {me?.is_platform_superadmin ? (
          <a href={exportHref} className="ppl-btn ppl-btn--ghost">Export Excel</a>
        ) : null}
        <ResetFiltersButton show={hasFilters} onReset={resetFilters} />
      </FilterBar>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{loading ? "Loading…" : `${total} employee${total === 1 ? "" : "s"} · ${departments.length} departments`}</span>
        {total > PAGE_LIMIT ? <span>Showing first {PAGE_LIMIT}. Refine filters to narrow.</span> : null}
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {view === "grouped" ? (
        <GroupedTable
          table={table}
          groupKey={(row) => row.department}
          emptyGroupLabel="No department"
          countNoun="person"
          minWidth={900}
          loading={loading}
          metaFor={(groupRows) => {
            const working = groupRows.filter((r) => r.original.employment_status === "working").length;
            return <GroupMetaStat label="working" value={working} />;
          }}
        />
      ) : (
        <div ref={parentRef} className="max-h-[68vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-3">
                      {h.isPlaceholder ? null : (
                        <button
                          type="button"
                          disabled={!h.column.getCanSort()}
                          onClick={h.column.getToggleSortingHandler()}
                          className={`inline-flex items-center gap-1 text-left ${h.column.getCanSort() ? "hover:text-slate-900" : "cursor-default"}`}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getCanSort() ? (
                            <span className="min-w-3 text-slate-400">{h.column.getIsSorted() === "asc" ? "▲" : h.column.getIsSorted() === "desc" ? "▼" : ""}</span>
                          ) : null}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {paddingTop > 0 && <tr><td style={{ height: paddingTop }} colSpan={colCount} /></tr>}
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
              {paddingBottom > 0 && <tr><td style={{ height: paddingBottom }} colSpan={colCount} /></tr>}
              {!loading && tableRows.length === 0 ? (
                <tr><td colSpan={colCount} className="px-4 py-10 text-center text-sm text-slate-400">No employees match these filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
