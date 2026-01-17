"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, API_BASE } from "@/lib/api";
import type { Asset } from "@/lib/types";

const ASSET_TYPES = ["LAPTOP", "DESKTOP", "MONITOR", "PHONE", "TABLET", "OTHER"] as const;
const ASSET_STATUSES = ["IN_STOCK", "ASSIGNED", "RETIRED", "LOST"] as const;
const MAX_CSV_BYTES = 5 * 1024 * 1024;

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function validateCsvFile(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (!name.endsWith(".csv") && !type.includes("csv")) {
    return "Only CSV files are allowed.";
  }
  if (file.size > MAX_CSV_BYTES) {
    return "CSV file is too large. Please upload a file under 5MB.";
  }
  return null;
}

function toIsoOrNull(dateValue: string) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function ItAssetsAdmin() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    asset_tag: "",
    asset_type: "LAPTOP",
    status: "IN_STOCK",
    serial_number: "",
    manufacturer: "",
    model: "",
    operating_system: "",
    purchase_date: "",
    warranty_end: "",
    location: "",
    assigned_person_id: "",
    assigned_email: "",
    assigned_name: "",
    notes: "",
  });

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const filteredAssets = useMemo(() => {
    if (statusFilter === "ALL") return assets;
    return assets.filter((asset) => asset.status === statusFilter);
  }, [assets, statusFilter]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiFetch<Asset[]>("/it/admin/assets");
      setAssets(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load assets");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    if (!form.asset_tag.trim()) return;
    setBusy(true);
    setError(null);
    try {
          await apiFetch<Asset>("/it/admin/assets", {
            method: "POST",
            body: JSON.stringify({
              asset_tag: form.asset_tag.trim(),
              asset_type: form.asset_type,
              status: form.status,
              serial_number: form.serial_number.trim() || null,
              manufacturer: form.manufacturer.trim() || null,
              model: form.model.trim() || null,
              operating_system: form.operating_system.trim() || null,
              purchase_date: toIsoOrNull(form.purchase_date),
              warranty_end: toIsoOrNull(form.warranty_end),
              location: form.location.trim() || null,
              assigned_person_id: form.assigned_person_id.trim() || null,
              assigned_email: form.assigned_email.trim() || null,
              assigned_name: form.assigned_name.trim() || null,
              notes: form.notes.trim() || null,
            }),
          });
          setForm({
            asset_tag: "",
            asset_type: "LAPTOP",
            status: "IN_STOCK",
            serial_number: "",
            manufacturer: "",
            model: "",
            operating_system: "",
            purchase_date: "",
            warranty_end: "",
            location: "",
            assigned_person_id: "",
            assigned_email: "",
            assigned_name: "",
            notes: "",
          });
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to save asset");
    } finally {
      setBusy(false);
    }
  };

  const downloadSample = () => {
    downloadText(
      "it-assets-sample.csv",
      [
        "asset_tag,asset_type,status,serial_number,manufacturer,model,operating_system,purchase_date,warranty_end,assigned_person_id,assigned_email,assigned_name,location,notes",
        "SL-LAP-0001,LAPTOP,IN_STOCK,SN1234,Dell,Latitude 5420,Windows 11,2025-01-10,2027-01-10,12345,,Devdutt,Desk 14,",
      ].join("\n")
    );
  };

  const uploadCsv = async (file: File) => {
    const validation = validateCsvFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("upload", file);
      const res = await fetch(`${API_BASE}/it/admin/assets/import`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e: any) {
      setError(e?.message || "CSV import failed");
    } finally {
      setBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
      setCsvFile(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="section-card">
        <h1 className="text-2xl font-semibold">IT Assets</h1>
        <p className="mt-2 text-steel">Track hardware inventory, ownership, and lifecycle status.</p>
      </section>

      {error ? (
        <section className="section-card border border-rose-500/20 bg-rose-500/10 text-rose-700">
          {error}
        </section>
      ) : null}

      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Add asset</h2>
            <p className="mt-1 text-sm text-steel">
              Use asset tag + type for tracking. Fill assignee only when the device is handed over.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold" onClick={downloadSample}>
              Sample CSV
            </button>
            <label className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold cursor-pointer">
              Choose CSV
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setError(null);
                  setCsvFile(file);
                }}
              />
            </label>
            <button
              type="button"
              className="rounded-full border border-black/10 bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy || !csvFile}
              onClick={() => csvFile && void uploadCsv(csvFile)}
            >
              Upload CSV
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <input
            className="rounded-xl border border-black/10 bg-white/60 px-4 py-2"
            placeholder="Asset tag (required)"
            value={form.asset_tag}
            onChange={(e) => setForm((s) => ({ ...s, asset_tag: e.target.value }))}
          />
          <select
            className="rounded-xl border border-black/10 bg-white/60 px-4 py-2"
            value={form.asset_type}
            onChange={(e) => setForm((s) => ({ ...s, asset_type: e.target.value }))}
          >
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-black/10 bg-white/60 px-4 py-2"
            value={form.status}
            onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
          >
            {ASSET_STATUSES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Serial number" value={form.serial_number} onChange={(e) => setForm((s) => ({ ...s, serial_number: e.target.value }))} />
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Manufacturer" value={form.manufacturer} onChange={(e) => setForm((s) => ({ ...s, manufacturer: e.target.value }))} />
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Model" value={form.model} onChange={(e) => setForm((s) => ({ ...s, model: e.target.value }))} />

          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Operating system" value={form.operating_system} onChange={(e) => setForm((s) => ({ ...s, operating_system: e.target.value }))} />
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" type="date" value={form.purchase_date} onChange={(e) => setForm((s) => ({ ...s, purchase_date: e.target.value }))} />
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" type="date" value={form.warranty_end} onChange={(e) => setForm((s) => ({ ...s, warranty_end: e.target.value }))} />

          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Assigned person ID" value={form.assigned_person_id} onChange={(e) => setForm((s) => ({ ...s, assigned_person_id: e.target.value }))} />
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Assigned email" value={form.assigned_email} onChange={(e) => setForm((s) => ({ ...s, assigned_email: e.target.value }))} />
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Assigned name" value={form.assigned_name} onChange={(e) => setForm((s) => ({ ...s, assigned_name: e.target.value }))} />

          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Location / desk" value={form.location} onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))} />
        </div>

        <textarea
          className="mt-3 w-full rounded-xl border border-black/10 bg-white/60 px-4 py-3"
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
        />

        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            disabled={busy || !form.asset_tag.trim()}
            onClick={() => void submit()}
            className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save asset
          </button>
        </div>
      </section>

      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Assets</h2>
            <span className="text-sm text-steel">{loading ? "Loading..." : `${filteredAssets.length} items`}</span>
          </div>
          <select
            className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {!loading && filteredAssets.length === 0 ? <p className="mt-4 text-sm text-steel">No assets yet.</p> : null}

        {filteredAssets.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-600">
                <tr>
                  <th className="py-2 pr-4">Tag</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Assignee</th>
                  <th className="py-2 pr-4">Location</th>
                  <th className="py-2 pr-4">Updated</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {filteredAssets.map((asset) => (
                  <tr key={asset.asset_id} className="border-t border-white/40">
                    <td className="py-2 pr-4 font-semibold">{asset.asset_tag}</td>
                    <td className="py-2 pr-4">{asset.asset_type}</td>
                    <td className="py-2 pr-4">{asset.status}</td>
                    <td className="py-2 pr-4">{asset.assigned_name || asset.assigned_email || "-"}</td>
                    <td className="py-2 pr-4">{asset.location || "-"}</td>
                    <td className="py-2 pr-4">{new Date(asset.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
