"use client";

import { type Table, type Row, flexRender } from "@tanstack/react-table";
import { CollapsibleGroup } from "./Grouped";

/**
 * Generic sortable table shell. Each tab builds its own `useReactTable`
 * instance (columns + state) and hands it here — this owns the sticky header,
 * sort affordances, pinned columns, and empty state so no tab re-implements them.
 */
export function DataTable<T>({
  table,
  minWidth,
  maxHeight = "72vh",
  pinnedLeft = [],
  pinnedRight = [],
  emptyLabel = "No records match these filters.",
  loading = false,
}: {
  table: Table<T>;
  minWidth?: number;
  maxHeight?: string;
  pinnedLeft?: string[];
  pinnedRight?: string[];
  emptyLabel?: string;
  loading?: boolean;
}) {
  const leftSet = new Set(pinnedLeft);
  const rightSet = new Set(pinnedRight);
  const rows = table.getRowModel().rows;
  const colCount = table.getVisibleLeafColumns().length;

  const pinClass = (columnId: string, isHeader: boolean): string => {
    const bg = isHeader ? "bg-slate-50" : "bg-white group-hover:bg-slate-50";
    if (leftSet.has(columnId)) return `sticky left-0 z-10 ${bg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]`;
    if (rightSet.has(columnId)) return `sticky right-0 z-10 ${bg} shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)]`;
    return "";
  };

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white" style={{ maxHeight }}>
      <table className="w-full border-collapse text-sm" style={minWidth ? { minWidth } : undefined}>
        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className={`whitespace-nowrap px-4 py-3 ${pinClass(h.column.id, true)} ${h.id === "actions" ? "text-right" : ""}`}>
                  {h.isPlaceholder ? null : (
                    <button
                      type="button"
                      disabled={!h.column.getCanSort()}
                      onClick={h.column.getToggleSortingHandler()}
                      className={`inline-flex items-center gap-1 text-left ${h.column.getCanSort() ? "hover:text-slate-900" : "cursor-default"}`}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getCanSort() ? (
                        <span className="min-w-3 text-slate-400">
                          {h.column.getIsSorted() === "asc" ? "▲" : h.column.getIsSorted() === "desc" ? "▼" : ""}
                        </span>
                      ) : null}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="group border-t border-slate-100 hover:bg-slate-50">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={`px-4 py-3 align-top text-slate-700 ${pinClass(cell.column.id, false)} ${cell.column.id === "actions" ? "text-right" : ""}`}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-4 py-10 text-center text-sm text-slate-400">
                {emptyLabel}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The same table, rendered as collapsible per-group sections. Reuses the table
 * instance's columns, sorting, and visibility — so switching Table ⟷ By-team is
 * purely a layout change. Rows come from the (already sorted/filtered) row model.
 */
export function GroupedTable<T>({
  table,
  groupKey,
  emptyGroupLabel = "Unassigned",
  accentFor,
  metaFor,
  minWidth,
  countNoun = "row",
  loading = false,
}: {
  table: Table<T>;
  groupKey: (original: T) => string | null | undefined;
  emptyGroupLabel?: string;
  accentFor?: (key: string) => string | null | undefined;
  metaFor?: (rows: Row<T>[], key: string) => React.ReactNode;
  minWidth?: number;
  countNoun?: string;
  loading?: boolean;
}) {
  const modelRows = table.getRowModel().rows;
  const colCount = table.getVisibleLeafColumns().length;

  const map = new Map<string, Row<T>[]>();
  for (const row of modelRows) {
    const raw = groupKey(row.original);
    const key = raw && String(raw).trim() ? String(raw).trim() : emptyGroupLabel;
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  const groups = Array.from(map.entries()).sort(([a], [b]) => {
    if (a === emptyGroupLabel) return 1;
    if (b === emptyGroupLabel) return -1;
    return a.localeCompare(b);
  });

  if (!loading && groups.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
        No records match these filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(([key, groupRows]) => (
        <CollapsibleGroup
          key={key}
          title={key}
          count={groupRows.length}
          countNoun={countNoun}
          accent={accentFor?.(key)}
          meta={metaFor?.(groupRows, key)}
        >
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm" style={minWidth ? { minWidth } : undefined}>
              <thead className="bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-slate-100">
                    {hg.headers.map((h) => (
                      <th key={h.id} className={`whitespace-nowrap px-4 py-2.5 ${h.id === "actions" ? "text-right" : ""}`}>
                        {h.isPlaceholder ? null : (
                          <button
                            type="button"
                            disabled={!h.column.getCanSort()}
                            onClick={h.column.getToggleSortingHandler()}
                            className={`inline-flex items-center gap-1 text-left ${h.column.getCanSort() ? "hover:text-slate-900" : "cursor-default"}`}
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {h.column.getCanSort() ? (
                              <span className="min-w-3 text-slate-400">
                                {h.column.getIsSorted() === "asc" ? "▲" : h.column.getIsSorted() === "desc" ? "▼" : ""}
                              </span>
                            ) : null}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {groupRows.map((row) => (
                  <tr key={row.id} className="group border-t border-slate-50 hover:bg-slate-50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={`px-4 py-2.5 align-top text-slate-700 ${cell.column.id === "actions" ? "text-right" : ""}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleGroup>
      ))}
      {!loading && colCount === 0 ? null : null}
    </div>
  );
}

/** Column visibility popover — works with any table instance. */
export function ColumnToggle<T>({ table, exclude = [] }: { table: Table<T>; exclude?: string[] }) {
  const excludeSet = new Set(exclude);
  return (
    <details className="relative">
      <summary className="ppl-btn ppl-btn--ghost cursor-pointer list-none">Columns</summary>
      <div className="absolute right-0 z-30 mt-1 grid max-h-[420px] w-64 gap-1 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        <button
          type="button"
          onClick={() => table.resetColumnVisibility()}
          className="rounded-lg px-2 py-1 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Reset visibility
        </button>
        {table
          .getAllLeafColumns()
          .filter((col) => !excludeSet.has(col.id))
          .map((col) => (
            <label key={col.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
              <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()} />
              {typeof col.columnDef.header === "string" ? col.columnDef.header : col.id}
            </label>
          ))}
      </div>
    </details>
  );
}

/** Export the currently visible rows/columns of a table instance to CSV. */
export function exportTableCsv<T>(table: Table<T>, filenamePrefix: string) {
  const columns = table.getVisibleLeafColumns().filter((col) => col.id !== "actions" && col.id !== "avatar");
  const headers = columns.map((col) => (typeof col.columnDef.header === "string" ? col.columnDef.header : col.id));
  const rows = table.getRowModel().rows.map((row) => columns.map((col) => row.getValue(col.id)));
  downloadCsv(headers, rows, filenamePrefix);
}

/** Export a plain array of rows (no TanStack table involved) to CSV. */
export function exportRowsCsv<T>(
  rows: T[],
  columns: Array<{ header: string; get: (row: T) => unknown }>,
  filenamePrefix: string,
) {
  downloadCsv(
    columns.map((col) => col.header),
    rows.map((row) => columns.map((col) => col.get(row))),
    filenamePrefix,
  );
}

function downloadCsv(headers: string[], rows: unknown[][], filenamePrefix: string) {
  const csv = [headers, ...rows]
    .map((line) => line.map((value) => csvEscape(value == null || value === "" ? "-" : String(value))).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
