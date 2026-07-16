"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pencil, Printer, Trash2, X } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { QrCode } from "@/components/ims-kit";
import type { Asset, Location } from "@/lib/types";

const STATUSES = ["IN_STOCK", "RESERVED", "ASSIGNED", "IN_REPAIR", "RETIRED", "LOST"];
const CONDITIONS = ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"];

const STATUS_STYLES: Record<string, string> = {
  IN_STOCK: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  RESERVED: "bg-amber-50 text-amber-700 ring-amber-200",
  ASSIGNED: "bg-blue-50 text-blue-700 ring-blue-200",
  IN_REPAIR: "bg-orange-50 text-orange-700 ring-orange-200",
  RETIRED: "bg-slate-100 text-slate-600 ring-slate-200",
  LOST: "bg-red-50 text-red-700 ring-red-200",
};

function money(n?: number | null, currency = "INR") {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-steel">{label}</span>
      <span className="text-right font-medium text-ink">{value ?? "—"}</span>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand";

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    apiFetch<Asset>(`/ims/assets/${id}`)
      .then((a) => { setAsset(a); setError(null); })
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }
  useEffect(load, [id]);
  useEffect(() => { apiFetch<Location[]>("/ims/locations").then(setLocations).catch(() => {}); }, []);

  function startEdit() {
    if (!asset) return;
    setEdit({
      status: asset.status,
      condition_rating: asset.condition_rating,
      location_id: asset.location_id ? String(asset.location_id) : "",
      serial_number: asset.serial_number || "",
      model_name: asset.model_name || "",
      purchase_cost: asset.purchase_cost != null ? String(asset.purchase_cost) : "",
      notes: asset.notes || "",
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      status: edit.status,
      condition_rating: edit.condition_rating,
      location_id: edit.location_id ? Number(edit.location_id) : null,
      serial_number: edit.serial_number || null,
      model_name: edit.model_name || null,
      purchase_cost: edit.purchase_cost ? Number(edit.purchase_cost) : null,
      notes: edit.notes || null,
    };
    try {
      const updated = await apiFetch<Asset>(`/ims/assets/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setAsset(updated);
      setEditing(false);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this asset? It will be removed from active inventory.")) return;
    try {
      await apiFetch(`/ims/assets/${id}`, { method: "DELETE" });
      router.push("/assets");
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  function printLabel() {
    window.print();
  }

  if (loading) return <div className="flex items-center gap-2 text-steel"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  if (error && !asset) return <p className="text-red-600">{error}</p>;
  if (!asset) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/assets" className="text-steel hover:text-ink"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="font-mono text-xl font-semibold text-ink">{asset.asset_tag}</h1>
            <p className="text-sm text-steel">{asset.manufacturer_name} {asset.model_name} · {asset.category_name}</p>
          </div>
          <span className={`ml-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLES[asset.status] || ""}`}>
            {asset.status.replace(/_/g, " ")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><X className="h-4 w-4" /> Cancel</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
              </button>
            </>
          ) : (
            <>
              <button onClick={startEdit} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Pencil className="h-4 w-4" /> Edit</button>
              <button onClick={remove} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </>
          )}
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{error}</p> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <section className="section-card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-steel">Overview</h2>
          {editing ? (
            <div className="space-y-3">
              <label className="block text-sm"><span className="text-steel">Status</span>
                <select className={inputCls} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select></label>
              <label className="block text-sm"><span className="text-steel">Condition</span>
                <select className={inputCls} value={edit.condition_rating} onChange={(e) => setEdit({ ...edit, condition_rating: e.target.value })}>
                  {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></label>
              <label className="block text-sm"><span className="text-steel">Location</span>
                <select className={inputCls} value={edit.location_id} onChange={(e) => setEdit({ ...edit, location_id: e.target.value })}>
                  <option value="">—</option>
                  {locations.map((l) => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
                </select></label>
              <label className="block text-sm"><span className="text-steel">Serial</span>
                <input className={inputCls} value={edit.serial_number} onChange={(e) => setEdit({ ...edit, serial_number: e.target.value })} /></label>
              <label className="block text-sm"><span className="text-steel">Model</span>
                <input className={inputCls} value={edit.model_name} onChange={(e) => setEdit({ ...edit, model_name: e.target.value })} /></label>
            </div>
          ) : (
            <div>
              <Row label="Category" value={asset.category_name} />
              <Row label="Manufacturer" value={asset.manufacturer_name} />
              <Row label="Model" value={asset.model_name} />
              <Row label="Serial number" value={asset.serial_number ? <span className="font-mono">{asset.serial_number}</span> : "—"} />
              <Row label="Condition" value={asset.condition_rating} />
              <Row label="Location" value={asset.location_name} />
              <Row label="Assigned to" value={asset.assigned_name} />
            </div>
          )}
        </section>

        <section className="section-card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-steel">Financials & warranty</h2>
          <Row label="Purchase cost" value={money(asset.purchase_cost, asset.currency)} />
          <Row label="Current book value" value={money(asset.current_book_value, asset.currency)} />
          <Row label="Age" value={asset.age_years != null ? `${asset.age_years} yr` : "—"} />
          <Row label="Useful life" value={asset.useful_life_years ? `${asset.useful_life_years} yr` : "—"} />
          <Row label="Purchase date" value={asset.purchase_date} />
          <Row label="Vendor" value={asset.vendor_name} />
          <Row
            label="Warranty"
            value={
              asset.warranty_end ? (
                <span className={
                  asset.warranty_status === "EXPIRED" ? "text-red-600"
                    : asset.warranty_status === "EXPIRING_SOON" ? "text-amber-600" : "text-emerald-600"
                }>
                  {asset.warranty_end}
                  {asset.warranty_days_left != null ? ` · ${asset.warranty_days_left}d left` : ""}
                </span>
              ) : "—"
            }
          />
        </section>

        <section className="section-card md:col-span-2 print:hidden">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-steel">Label · QR</h2>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-slate-200 bg-white p-2">
                <QrCode value={asset.qr_payload || asset.asset_tag} size={80} />
              </div>
              <div>
                <p className="font-mono text-lg font-semibold text-ink">{asset.asset_tag}</p>
                <p className="text-sm text-steel">Scan this to pull up the asset instantly.</p>
                <p className="mt-1 text-xs text-steel">Print sticks a scannable label — tag, serial & QR — ready for a label printer or A4 sheet.</p>
              </div>
            </div>
            <button onClick={printLabel} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Printer className="h-4 w-4" /> Print label
            </button>
          </div>
        </section>

        {/* Print-only label: isolated via .print-label so "Print label" outputs a single small sticker, not the whole page. */}
        <section className="print-label hidden print:flex print:h-[1in] print:w-[3in] print:items-center print:gap-3 print:border print:border-black print:p-2">
          <QrCode value={asset.qr_payload || asset.asset_tag} size={64} />
          <div className="text-black">
            <p className="font-mono text-sm font-bold">{asset.asset_tag}</p>
            {asset.serial_number ? <p className="font-mono text-[10px]">{asset.serial_number}</p> : null}
            <p className="text-[10px]">{asset.manufacturer_name} {asset.model_name}</p>
          </div>
        </section>

        {asset.notes ? (
          <section className="section-card md:col-span-2">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-steel">Notes</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{asset.notes}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
