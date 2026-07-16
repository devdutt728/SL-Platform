"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { apiFetch } from "@/lib/api";
import type { Category, Location, Manufacturer, Product, Vendor } from "@/lib/types";

const TABS = ["Categories", "Manufacturers", "Vendors", "Locations", "Products"] as const;
type Tab = (typeof TABS)[number];

const inputCls = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand";
const th = "pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400";
const td = "py-2 pr-3 text-slate-700";

function Card({ children }: { children: React.ReactNode }) {
  return <div className="section-card">{children}</div>;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("Categories");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">IMS settings</h1>
        <p className="text-sm text-steel">Master data that powers autofill and asset tagging.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-3.5 py-1.5 text-sm font-semibold transition ${
              tab === t ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Categories" && <Categories />}
      {tab === "Manufacturers" && <Manufacturers />}
      {tab === "Vendors" && <Vendors />}
      {tab === "Locations" && <Locations />}
      {tab === "Products" && <Products />}
    </div>
  );
}

function useList<T>(path: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = () => {
    setLoading(true);
    apiFetch<T[]>(path).then(setItems).catch((e) => setError(String(e?.message || e))).finally(() => setLoading(false));
  };
  useEffect(reload, [path]);
  return { items, loading, error, reload, setError };
}

function AddButton({ saving }: { saving: boolean }) {
  return (
    <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
    </button>
  );
}

function Categories() {
  const { items, loading, error, reload, setError } = useList<Category>("/ims/categories?include_inactive=true");
  const [f, setF] = useState({ name: "", code: "", default_warranty_months: "", default_useful_life_years: "" });
  const [saving, setSaving] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await apiFetch("/ims/categories", { method: "POST", body: JSON.stringify({
        name: f.name, code: f.code,
        default_warranty_months: f.default_warranty_months ? Number(f.default_warranty_months) : null,
        default_useful_life_years: f.default_useful_life_years ? Number(f.default_useful_life_years) : null,
      }) });
      setF({ name: "", code: "", default_warranty_months: "", default_useful_life_years: "" });
      reload();
    } catch (err: any) { setError(String(err?.message || err)); } finally { setSaving(false); }
  }
  return (
    <Card>
      <form onSubmit={add} className="mb-4 flex flex-wrap items-end gap-2">
        <input className={inputCls} placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input className={`${inputCls} w-24 font-mono uppercase`} placeholder="CODE" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} required />
        <input className={`${inputCls} w-28`} type="number" placeholder="Warranty (mo)" value={f.default_warranty_months} onChange={(e) => setF({ ...f, default_warranty_months: e.target.value })} />
        <input className={`${inputCls} w-28`} type="number" placeholder="Life (yr)" value={f.default_useful_life_years} onChange={(e) => setF({ ...f, default_useful_life_years: e.target.value })} />
        <AddButton saving={saving} />
      </form>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      <Table
        loading={loading}
        head={["Name", "Code", "Kind", "Warranty", "Life", "Active"]}
        rows={items.map((c) => [c.name, <span className="font-mono">{c.code}</span>, c.item_kind, c.default_warranty_months ? `${c.default_warranty_months} mo` : "—", c.default_useful_life_years ? `${c.default_useful_life_years} yr` : "—", c.is_active ? "Yes" : "No"])}
      />
    </Card>
  );
}

function Manufacturers() {
  const { items, loading, error, reload, setError } = useList<Manufacturer>("/ims/manufacturers");
  const [name, setName] = useState(""); const [saving, setSaving] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try { await apiFetch("/ims/manufacturers", { method: "POST", body: JSON.stringify({ name }) }); setName(""); reload(); }
    catch (err: any) { setError(String(err?.message || err)); } finally { setSaving(false); }
  }
  return (
    <Card>
      <form onSubmit={add} className="mb-4 flex items-end gap-2">
        <input className={inputCls} placeholder="Manufacturer name" value={name} onChange={(e) => setName(e.target.value)} required />
        <AddButton saving={saving} />
      </form>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      <Table loading={loading} head={["Name", "Active"]} rows={items.map((m) => [m.name, m.is_active ? "Yes" : "No"])} />
    </Card>
  );
}

function Vendors() {
  const { items, loading, error, reload, setError } = useList<Vendor>("/ims/vendors");
  const [f, setF] = useState({ name: "", contact_person: "", email: "", phone: "", gstin: "" });
  const [saving, setSaving] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try { await apiFetch("/ims/vendors", { method: "POST", body: JSON.stringify(f) }); setF({ name: "", contact_person: "", email: "", phone: "", gstin: "" }); reload(); }
    catch (err: any) { setError(String(err?.message || err)); } finally { setSaving(false); }
  }
  return (
    <Card>
      <form onSubmit={add} className="mb-4 flex flex-wrap items-end gap-2">
        <input className={inputCls} placeholder="Vendor name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input className={inputCls} placeholder="Contact person" value={f.contact_person} onChange={(e) => setF({ ...f, contact_person: e.target.value })} />
        <input className={inputCls} placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input className={inputCls} placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <input className={`${inputCls} w-32`} placeholder="GSTIN" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} />
        <AddButton saving={saving} />
      </form>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      <Table loading={loading} head={["Name", "Contact", "Email", "Phone", "GSTIN"]} rows={items.map((v) => [v.name, v.contact_person || "—", v.email || "—", v.phone || "—", v.gstin || "—"])} />
    </Card>
  );
}

function Locations() {
  const { items, loading, error, reload, setError } = useList<Location>("/ims/locations");
  const [f, setF] = useState({ name: "", kind: "OFFICE" }); const [saving, setSaving] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try { await apiFetch("/ims/locations", { method: "POST", body: JSON.stringify(f) }); setF({ name: "", kind: "OFFICE" }); reload(); }
    catch (err: any) { setError(String(err?.message || err)); } finally { setSaving(false); }
  }
  return (
    <Card>
      <form onSubmit={add} className="mb-4 flex flex-wrap items-end gap-2">
        <input className={inputCls} placeholder="Location name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {["OFFICE", "FLOOR", "ROOM", "STORE", "OTHER"].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <AddButton saving={saving} />
      </form>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      <Table loading={loading} head={["Name", "Kind", "Active"]} rows={items.map((l) => [l.name, l.kind, l.is_active ? "Yes" : "No"])} />
    </Card>
  );
}

function Products() {
  const { items, loading, error, reload, setError } = useList<Product>("/ims/products");
  const [cats, setCats] = useState<Category[]>([]);
  const [mfrs, setMfrs] = useState<Manufacturer[]>([]);
  const [f, setF] = useState({ category_id: "", manufacturer_id: "", model_name: "", default_warranty_months: "", default_useful_life_years: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiFetch<Category[]>("/ims/categories").then(setCats).catch(() => {});
    apiFetch<Manufacturer[]>("/ims/manufacturers").then(setMfrs).catch(() => {});
  }, []);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      await apiFetch("/ims/products", { method: "POST", body: JSON.stringify({
        category_id: Number(f.category_id),
        manufacturer_id: f.manufacturer_id ? Number(f.manufacturer_id) : null,
        model_name: f.model_name,
        default_warranty_months: f.default_warranty_months ? Number(f.default_warranty_months) : null,
        default_useful_life_years: f.default_useful_life_years ? Number(f.default_useful_life_years) : null,
      }) });
      setF({ category_id: "", manufacturer_id: "", model_name: "", default_warranty_months: "", default_useful_life_years: "" });
      reload();
    } catch (err: any) { setError(String(err?.message || err)); } finally { setSaving(false); }
  }
  return (
    <Card>
      <form onSubmit={add} className="mb-4 flex flex-wrap items-end gap-2">
        <select className={inputCls} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })} required>
          <option value="">Category…</option>
          {cats.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
        </select>
        <select className={inputCls} value={f.manufacturer_id} onChange={(e) => setF({ ...f, manufacturer_id: e.target.value })}>
          <option value="">Manufacturer…</option>
          {mfrs.map((m) => <option key={m.manufacturer_id} value={m.manufacturer_id}>{m.name}</option>)}
        </select>
        <input className={inputCls} placeholder="Model name" value={f.model_name} onChange={(e) => setF({ ...f, model_name: e.target.value })} required />
        <input className={`${inputCls} w-28`} type="number" placeholder="Warranty (mo)" value={f.default_warranty_months} onChange={(e) => setF({ ...f, default_warranty_months: e.target.value })} />
        <input className={`${inputCls} w-24`} type="number" placeholder="Life (yr)" value={f.default_useful_life_years} onChange={(e) => setF({ ...f, default_useful_life_years: e.target.value })} />
        <AddButton saving={saving} />
      </form>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      <Table loading={loading} head={["Model", "Manufacturer", "Category", "Warranty", "Life"]}
        rows={items.map((p) => [p.model_name, p.manufacturer_name || "—", p.category_name || "—", p.default_warranty_months ? `${p.default_warranty_months} mo` : "—", p.default_useful_life_years ? `${p.default_useful_life_years} yr` : "—"])} />
    </Card>
  );
}

function Table({ head, rows, loading }: { head: string[]; rows: React.ReactNode[][]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-200">{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={head.length} className="py-6 text-center text-steel">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={head.length} className="py-6 text-center text-steel">Nothing yet.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">{r.map((c, j) => <td key={j} className={td}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
