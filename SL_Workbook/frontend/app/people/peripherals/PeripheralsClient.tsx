"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { pplDelete, pplGet, pplPatch, pplPost } from "../_lib/client";
import {
  ColumnToggle,
  DataTable,
  FilterBar,
  FilterSelect,
  GroupedTable,
  GroupMetaStat,
  ResetFiltersButton,
  SavedViewsMenu,
  SearchInput,
  SegmentedControl,
  VIEW_OPTIONS,
  exportTableCsv,
  useDebounced,
} from "../_components/data";
import type { PeripheralInventoryItem, PeripheralInventoryListResponse } from "../_lib/types";

const CONDITION_OPTIONS = ["Good", "Faulty", "In Repair"];
const STATUS_OPTIONS = ["Active", "Faulty", "Retired", "Disposed"];

type PeripheralsFilterSnapshot = { search: string; category: string; condition: string; view: string };

const emptyPeripheral = {
  item_id: "",
  category: "",
  item: "",
  model: "",
  quantity: "1",
  condition: "Good",
  location: "",
  assigned_to: "",
  status: "Active",
  notes: "",
};

export function PeripheralsClient() {
  const [rows, setRows] = useState<PeripheralInventoryItem[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 250);
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [view, setView] = useState<string>("table");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyPeripheral);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "item", desc: false }]);

  const load = () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ page: "1", limit: "300" });
    if (search.trim()) qs.set("search", search.trim());
    if (category) qs.set("category", category);
    if (condition) qs.set("condition", condition);
    pplGet<PeripheralInventoryListResponse>(`/peripherals?${qs.toString()}`)
      .then((data) => setRows(data.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, condition]);

  const categories = useMemo(() => unique(rows.map((r) => r.category)), [rows]);
  const conditions = useMemo(() => unique(rows.map((r) => r.condition)), [rows]);

  async function createPeripheral() {
    if (!form.item_id.trim() || !form.item.trim()) return;
    setSaving(true);
    try {
      await pplPost("/peripherals", cleanPayload({ ...form, quantity: Number(form.quantity || 1) }));
      setForm(emptyPeripheral);
      setShowAdd(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add peripheral");
    } finally {
      setSaving(false);
    }
  }

  async function patchPeripheral(id: string, body: Record<string, unknown>) {
    try {
      await pplPatch(`/peripherals/${id}`, cleanPayload(body));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update peripheral");
    }
  }

  async function deletePeripheral(id: string) {
    try {
      await pplDelete(`/peripherals/${id}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete peripheral");
    }
  }

  const columns = useMemo<ColumnDef<PeripheralInventoryItem>[]>(
    () => [
      {
        accessorKey: "item",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-slate-900">{row.original.item}</div>
            <div className="text-[11px] text-steel">{row.original.item_id}</div>
          </div>
        ),
      },
      { accessorKey: "category", header: "Category", cell: (c) => c.getValue() || "—" },
      { accessorKey: "model", header: "Model", cell: (c) => c.getValue() || "—" },
      { accessorKey: "quantity", header: "Qty" },
      {
        accessorKey: "condition",
        header: "Condition",
        cell: ({ row }) => (
          <InlineSelect value={row.original.condition || ""} options={CONDITION_OPTIONS} onChange={(condition) => patchPeripheral(row.original.id, { condition })} />
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <InlineSelect value={row.original.status} options={STATUS_OPTIONS} onChange={(status) => patchPeripheral(row.original.id, { status })} />
        ),
      },
      {
        id: "assigned",
        header: "Assigned / Location",
        accessorFn: (row) => row.assigned_to || "",
        cell: ({ row }) => (
          <div>
            <div>{row.original.assigned_to || "—"}</div>
            <div className="text-[11px] text-steel">{row.original.location || "No location"}</div>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <button onClick={() => deletePeripheral(row.original.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
            Delete
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const hasFilters = Boolean(searchInput || category || condition);

  function resetFilters() {
    setSearchInput("");
    setCategory("");
    setCondition("");
  }

  const filterSnapshot: PeripheralsFilterSnapshot = { search: searchInput, category, condition, view };

  function applyFilterSnapshot(v: PeripheralsFilterSnapshot) {
    setSearchInput(v.search ?? "");
    setCategory(v.category ?? "");
    setCondition(v.condition ?? "");
    setView(v.view ?? "table");
  }

  return (
    <section className="public-panel">
      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Peripherals</h2>
          <p className="text-xs text-steel">
            {loading ? "Loading…" : `${rows.length} visible item${rows.length === 1 ? "" : "s"} · ${categories.length} categories`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search item, model, assignee" />
          <SegmentedControl value={view} onChange={setView} options={VIEW_OPTIONS} />
          <ColumnToggle table={table} />
          <SavedViewsMenu storageKey="ppl.peripherals.views" currentValues={filterSnapshot} onApply={applyFilterSnapshot} />
          <button onClick={() => exportTableCsv(table, "peripherals-inventory")} className="ppl-btn ppl-btn--ghost">Export</button>
          <button onClick={() => setShowAdd((v) => !v)} className={`ppl-btn ${showAdd ? "ppl-btn--active" : "ppl-btn--primary"}`}>
            {showAdd ? "Close" : "Add item"}
          </button>
        </div>
      </div>

      <FilterBar className="mb-4">
        <FilterSelect value={category} onChange={setCategory} label="All categories" options={categories} />
        <FilterSelect value={condition} onChange={setCondition} label="All conditions" options={conditions} />
        <ResetFiltersButton show={hasFilters} onReset={resetFilters} />
      </FilterBar>

      {showAdd ? (
        <div className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 lg:grid-cols-8">
          <Input value={form.item_id} placeholder="item id" onChange={(v) => setForm({ ...form, item_id: v })} />
          <Input value={form.category} placeholder="category" onChange={(v) => setForm({ ...form, category: v })} />
          <Input value={form.item} placeholder="item" onChange={(v) => setForm({ ...form, item: v })} />
          <Input value={form.model} placeholder="model" onChange={(v) => setForm({ ...form, model: v })} />
          <Input value={form.quantity} placeholder="qty" onChange={(v) => setForm({ ...form, quantity: v })} />
          <Input value={form.location} placeholder="location" onChange={(v) => setForm({ ...form, location: v })} />
          <Input value={form.assigned_to} placeholder="assigned to" onChange={(v) => setForm({ ...form, assigned_to: v })} />
          <button disabled={saving} onClick={createPeripheral} className="rounded-xl bg-[var(--brand-color)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Add Item</button>
        </div>
      ) : null}

      {view === "grouped" ? (
        <GroupedTable
          table={table}
          groupKey={(row) => row.category}
          emptyGroupLabel="Uncategorised"
          countNoun="item"
          minWidth={1060}
          loading={loading}
          metaFor={(groupRows) => {
            const qty = groupRows.reduce((sum, r) => sum + (r.original.quantity || 0), 0);
            return <GroupMetaStat label="units" value={qty} />;
          }}
        />
      ) : (
        <DataTable
          table={table}
          minWidth={1060}
          pinnedLeft={["item"]}
          pinnedRight={["actions"]}
          emptyLabel="No peripherals match these filters."
          loading={loading}
        />
      )}
    </section>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400" />;
}

function InlineSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">{options.map((o) => <option key={o}>{o}</option>)}</select>;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
}

function cleanPayload(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== "" && v !== undefined && v !== null));
}
