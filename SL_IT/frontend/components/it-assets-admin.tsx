"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

type Asset = {
  asset_id: number;
  asset_tag: string;
  asset_type: string;
  status: string;
  serial_number?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  operating_system?: string | null;
  assigned_email?: string | null;
  assigned_name?: string | null;
  location?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

const assetTypes = ["LAPTOP", "DESKTOP", "SERVER", "MOBILE", "PERIPHERAL", "OTHER"];
const assetStatuses = ["ACTIVE", "IN_STOCK", "IN_REPAIR", "RETIRED", "LOST", "STOLEN"];

const emptyForm = {
  asset_tag: "",
  asset_type: "LAPTOP",
  status: "IN_STOCK",
  serial_number: "",
  manufacturer: "",
  model: "",
  operating_system: "",
  assigned_email: "",
  assigned_name: "",
  location: "",
  notes: "",
  purchase_date: "",
  warranty_end: "",
};

export function ItAssetsAdmin() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [statusFilter, setStatusFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string>("");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  const loadAssets = () => {
    const query = statusFilter ? `?status_filter=${statusFilter}` : "";
    apiFetch<Asset[]>(`/it/admin/assets${query}`)
      .then(setAssets)
      .catch(() => setAssets([]));
  };

  useEffect(() => {
    loadAssets();
  }, [statusFilter]);

  const createAsset = async () => {
    if (!form.asset_tag.trim()) return;
    setSaving(true);
    await apiFetch("/it/admin/assets", {
      method: "POST",
      body: JSON.stringify({
        asset_tag: form.asset_tag.trim(),
        asset_type: form.asset_type,
        status: form.status,
        serial_number: form.serial_number || null,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        operating_system: form.operating_system || null,
        assigned_email: form.assigned_email || null,
        assigned_name: form.assigned_name || null,
        location: form.location || null,
        notes: form.notes || null,
        purchase_date: form.purchase_date || null,
        warranty_end: form.warranty_end || null,
      }),
    });
    setForm({ ...emptyForm });
    setSaving(false);
    loadAssets();
  };

  const retireAsset = async (assetId: number) => {
    await apiFetch(`/it/admin/assets/${assetId}`, { method: "DELETE" });
    loadAssets();
  };

  const importAssets = async () => {
    if (!importFile) return;
    setImportResult("Uploading...");
    const formData = new FormData();
    formData.append("file", importFile);
    const res = await fetch(`${basePath}/api/it/admin/assets/import`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) {
      setImportResult(data?.detail || "Import failed");
      return;
    }
    setImportResult(`Imported ${data.inserted} rows, ${data.errors.length} errors`);
    setImportFile(null);
    loadAssets();
  };

  return (
    <div className="space-y-6">
      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Add asset</h2>
            <p className="mt-2 text-sm text-steel">
              Use asset tag + type for tracking. Fill assignee only when the device is handed over.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
            <a
              href={`${basePath}/templates/assets_import_sample.csv`}
              className="rounded-full border border-black/10 px-3 py-1"
            >
              Sample CSV
            </a>
            <label className="rounded-full border border-black/10 px-3 py-1">
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(event) => setImportFile(event.target.files?.[0] || null)}
              />
              {importFile ? "File selected" : "Choose CSV"}
            </label>
            <button
              className="rounded-full bg-ink px-3 py-1 text-white disabled:opacity-50"
              onClick={importAssets}
              disabled={!importFile}
            >
              Upload
            </button>
          </div>
        </div>
        {importResult && <div className="mt-3 text-xs text-steel">{importResult}</div>}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Asset tag (required)"
            value={form.asset_tag}
            onChange={(event) => setForm({ ...form, asset_tag: event.target.value })}
          />
          <select
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            value={form.asset_type}
            onChange={(event) => setForm({ ...form, asset_type: event.target.value })}
          >
            {assetTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value })}
          >
            {assetStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Serial number"
            value={form.serial_number}
            onChange={(event) => setForm({ ...form, serial_number: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Manufacturer"
            value={form.manufacturer}
            onChange={(event) => setForm({ ...form, manufacturer: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Model"
            value={form.model}
            onChange={(event) => setForm({ ...form, model: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Operating system"
            value={form.operating_system}
            onChange={(event) => setForm({ ...form, operating_system: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Assigned email"
            value={form.assigned_email}
            onChange={(event) => setForm({ ...form, assigned_email: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Assigned name"
            value={form.assigned_name}
            onChange={(event) => setForm({ ...form, assigned_name: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Location / desk"
            value={form.location}
            onChange={(event) => setForm({ ...form, location: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            type="date"
            value={form.purchase_date}
            onChange={(event) => setForm({ ...form, purchase_date: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            type="date"
            value={form.warranty_end}
            onChange={(event) => setForm({ ...form, warranty_end: event.target.value })}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <textarea
            className="md:col-span-2 rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
          <button
            className="h-full rounded-2xl bg-ink px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={createAsset}
            disabled={saving || !form.asset_tag.trim()}
          >
            {saving ? "Saving..." : "Save asset"}
          </button>
        </div>
      </section>

      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Assets</h2>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
              {assets.length} items
            </span>
          </div>
          <select
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            {assetStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 grid gap-3">
          {assets.map((asset) => (
            <div key={asset.asset_id} className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                      {asset.asset_type}
                    </span>
                    {asset.asset_tag}
                  </div>
                  <div className="mt-1 text-xs text-steel">
                    {asset.manufacturer || "Unknown"} {asset.model || ""}
                  </div>
                  <div className="mt-1 text-xs text-steel">
                    {asset.assigned_name || "Unassigned"} {asset.assigned_email ? `• ${asset.assigned_email}` : ""}
                  </div>
                </div>
                <div className="text-xs text-steel">
                  <span className="rounded-full bg-slate-100 px-3 py-1">{asset.status}</span>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-steel md:grid-cols-3">
                <span>Serial: {asset.serial_number || "NA"}</span>
                <span>OS: {asset.operating_system || "NA"}</span>
                <span>Location: {asset.location || "NA"}</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-slate-700"
                  onClick={() => retireAsset(asset.asset_id)}
                >
                  Retire
                </button>
              </div>
            </div>
          ))}
          {!assets.length && <div className="text-sm text-steel">No assets yet.</div>}
        </div>
      </section>
    </div>
  );
}
