"use client";

import { useEffect, useMemo, useState } from "react";
import { pplDelete, pplGet, pplPatch, pplPost } from "../_lib/client";
import type { PeripheralInventoryItem, PeripheralInventoryListResponse } from "../_lib/types";

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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [form, setForm] = useState(emptyPeripheral);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, condition]);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).sort() as string[], [rows]);
  const conditions = useMemo(() => Array.from(new Set(rows.map((r) => r.condition).filter(Boolean))).sort() as string[], [rows]);

  async function createPeripheral() {
    if (!form.item_id.trim() || !form.item.trim()) return;
    setSaving(true);
    try {
      await pplPost("/peripherals", cleanPayload({ ...form, quantity: Number(form.quantity || 1) }));
      setForm(emptyPeripheral);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add peripheral");
    } finally {
      setSaving(false);
    }
  }

  async function patchPeripheral(id: string, body: Record<string, unknown>) {
    await pplPatch(`/peripherals/${id}`, cleanPayload(body));
    load();
  }

  return (
    <section className="public-panel">
      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Inventory</h2>
          <p className="text-xs text-steel">{loading ? "Loading..." : `${rows.length} visible item${rows.length === 1 ? "" : "s"}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={condition} onChange={(e) => setCondition(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            <option value="">All conditions</option>
            {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item, model, assignee" className="min-w-[240px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400" />
        </div>
      </div>

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

      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1060px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Item</th><th>Category</th><th>Model</th><th>Qty</th><th>Condition</th><th>Status</th><th>Assigned / Location</th><th className="text-right pr-4">Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3"><div className="font-medium text-slate-900">{row.item}</div><div className="text-xs text-steel">{row.item_id}</div></td>
                <td>{row.category || "—"}</td>
                <td>{row.model || "—"}</td>
                <td>{row.quantity}</td>
                <td><InlineSelect value={row.condition || ""} options={["Good", "Faulty", "In Repair"]} onChange={(condition) => patchPeripheral(row.id, { condition })} /></td>
                <td><InlineSelect value={row.status} options={["Active", "Faulty", "Retired", "Disposed"]} onChange={(status) => patchPeripheral(row.id, { status })} /></td>
                <td><div>{row.assigned_to || "—"}</div><div className="text-xs text-steel">{row.location || "No location"}</div></td>
                <td className="pr-4 text-right"><button onClick={async () => { await pplDelete(`/peripherals/${row.id}`); load(); }} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Delete</button></td>
              </tr>
            ))}
            {!loading && !rows.length ? <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">No peripherals match these filters.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400" />;
}

function InlineSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">{options.map((o) => <option key={o}>{o}</option>)}</select>;
}

function cleanPayload(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== "" && v !== undefined && v !== null));
}
