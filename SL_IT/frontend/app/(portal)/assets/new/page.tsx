"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Tag } from "lucide-react";

import { apiFetch } from "@/lib/api";
import type { Asset, Category, Location, Manufacturer, NextTag, Product, Vendor } from "@/lib/types";

const CONDITIONS = ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-xs text-steel">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export default function NewAssetPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [nextTag, setNextTag] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    category_id: "",
    product_id: "",
    manufacturer_id: "",
    model_name: "",
    serial_number: "",
    condition_rating: "NEW",
    status: "IN_STOCK",
    vendor_id: "",
    purchase_cost: "",
    purchase_date: "",
    location_id: "",
    notes: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    apiFetch<Category[]>("/ims/categories").then(setCategories).catch(() => {});
    apiFetch<Manufacturer[]>("/ims/manufacturers").then(setManufacturers).catch(() => {});
    apiFetch<Vendor[]>("/ims/vendors").then(setVendors).catch(() => {});
    apiFetch<Location[]>("/ims/locations").then(setLocations).catch(() => {});
  }, []);

  // Preview next tag + load product catalog when category changes.
  useEffect(() => {
    if (!form.category_id) {
      setNextTag("");
      setProducts([]);
      return;
    }
    apiFetch<NextTag>(`/ims/assets/next-tag?category_id=${form.category_id}`)
      .then((r) => setNextTag(r.next_tag))
      .catch(() => setNextTag(""));
    apiFetch<Product[]>(`/ims/products?category_id=${form.category_id}`)
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [form.category_id]);

  // Autofill model + manufacturer from the chosen product.
  function pickProduct(id: string) {
    set("product_id", id);
    const p = products.find((x) => String(x.product_id) === id);
    if (p) {
      setForm((f) => ({
        ...f,
        product_id: id,
        model_name: p.model_name,
        manufacturer_id: p.manufacturer_id ? String(p.manufacturer_id) : f.manufacturer_id,
      }));
    }
  }

  const selectedCategory = useMemo(
    () => categories.find((c) => String(c.category_id) === form.category_id),
    [categories, form.category_id]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category_id) {
      setError("Please choose a category.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      category_id: Number(form.category_id),
      condition_rating: form.condition_rating,
      status: form.status,
      currency: "INR",
    };
    if (form.product_id) payload.product_id = Number(form.product_id);
    if (form.manufacturer_id) payload.manufacturer_id = Number(form.manufacturer_id);
    if (form.model_name) payload.model_name = form.model_name;
    if (form.serial_number) payload.serial_number = form.serial_number;
    if (form.vendor_id) payload.vendor_id = Number(form.vendor_id);
    if (form.purchase_cost) payload.purchase_cost = Number(form.purchase_cost);
    if (form.purchase_date) payload.purchase_date = form.purchase_date;
    if (form.location_id) payload.location_id = Number(form.location_id);
    if (form.notes) payload.notes = form.notes;

    try {
      const created = await apiFetch<Asset>("/ims/assets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.push(`/assets/${created.asset_id}`);
    } catch (err: any) {
      setError(String(err?.message || err));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/assets" className="text-steel hover:text-ink"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="text-xl font-semibold">Add asset</h1>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {/* 1. Identity */}
        <section className="section-card space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-steel">1 · What is it?</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category *">
              <select className={inputCls} value={form.category_id} onChange={(e) => { set("category_id", e.target.value); set("product_id", ""); }} required>
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Auto asset tag" hint="Generated on save — you can't mistype it.">
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-brand/40 bg-brand/5 px-3 py-2 text-sm font-mono font-semibold text-brand">
                <Tag className="h-4 w-4" />
                {nextTag || "— pick a category —"}
              </div>
            </Field>
            <Field label="Model / product" hint={products.length ? "Pick to autofill specs" : "No catalog models yet — type below"}>
              <select className={inputCls} value={form.product_id} onChange={(e) => pickProduct(e.target.value)} disabled={!products.length}>
                <option value="">{products.length ? "Choose model…" : "—"}</option>
                {products.map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.manufacturer_name ? `${p.manufacturer_name} ` : ""}{p.model_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Manufacturer">
              <select className={inputCls} value={form.manufacturer_id} onChange={(e) => set("manufacturer_id", e.target.value)}>
                <option value="">—</option>
                {manufacturers.map((m) => (
                  <option key={m.manufacturer_id} value={m.manufacturer_id}>{m.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Model name">
              <input className={inputCls} value={form.model_name} onChange={(e) => set("model_name", e.target.value)} placeholder="e.g. Latitude 5440" />
            </Field>
            <Field label="Serial number" hint="Scan the barcode or type it">
              <input className={inputCls} value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} placeholder="Scan / enter S/N" autoFocus />
            </Field>
          </div>
        </section>

        {/* 2. Condition & status */}
        <section className="section-card space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-steel">2 · Condition</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Condition">
              <select className={inputCls} value={form.condition_rating} onChange={(e) => set("condition_rating", e.target.value)}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Location">
              <select className={inputCls} value={form.location_id} onChange={(e) => set("location_id", e.target.value)}>
                <option value="">—</option>
                {locations.map((l) => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
              </select>
            </Field>
          </div>
        </section>

        {/* 3. Purchase */}
        <section className="section-card space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-steel">3 · Purchase</h2>
          <p className="text-xs text-steel">
            Warranty & depreciation are auto-calculated from the purchase date using the
            {selectedCategory?.default_warranty_months ? ` ${selectedCategory.default_warranty_months}-month` : ""} category defaults.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Vendor">
              <select className={inputCls} value={form.vendor_id} onChange={(e) => set("vendor_id", e.target.value)}>
                <option value="">—</option>
                {vendors.map((v) => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Cost (₹)">
              <input type="number" className={inputCls} value={form.purchase_cost} onChange={(e) => set("purchase_cost", e.target.value)} placeholder="0" />
            </Field>
            <Field label="Purchase date">
              <input type="date" className={inputCls} value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything else worth recording…" />
          </Field>
        </section>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{error}</p> : null}

        <div className="flex items-center justify-end gap-3">
          <Link href="/assets" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</Link>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save asset
          </button>
        </div>
      </form>
    </div>
  );
}
