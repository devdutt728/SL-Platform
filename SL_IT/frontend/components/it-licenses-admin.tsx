"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, API_BASE } from "@/lib/api";
import type { License, LicenseAssignment, Vendor } from "@/lib/types";

const LICENSE_TYPES = ["SUBSCRIPTION", "PERPETUAL"] as const;
const BILLING_CYCLES = ["MONTHLY", "QUARTERLY", "ANNUAL", "ONE_TIME"] as const;
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

export function ItLicensesAdmin() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [assignments, setAssignments] = useState<LicenseAssignment[]>([]);
  const [selectedLicenseId, setSelectedLicenseId] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const [vendorName, setVendorName] = useState("");
  const [licenseForm, setLicenseForm] = useState({
    name: "",
    vendor_id: "",
    sku: "",
    license_type: "SUBSCRIPTION",
    total_seats: "1",
    billing_cycle: "ANNUAL",
    contract_start: "",
    contract_end: "",
    renewal_date: "",
    registered_email: "",
    cost_amount: "",
    cost_currency: "INR",
    notes: "",
  });
  const [assignmentForm, setAssignmentForm] = useState({
    asset_id: "",
    assignee_email: "",
    assignee_name: "",
    status: "ASSIGNED",
    notes: "",
  });

  const licenseInputRef = useRef<HTMLInputElement | null>(null);
  const assignmentCsvRef = useRef<HTMLInputElement | null>(null);
  const [licenseCsvFile, setLicenseCsvFile] = useState<File | null>(null);
  const [assignmentCsvFile, setAssignmentCsvFile] = useState<File | null>(null);

  const selectedLicense = useMemo(() => {
    if (!selectedLicenseId) return null;
    return licenses.find((l) => l.license_id === selectedLicenseId) || null;
  }, [licenses, selectedLicenseId]);

  const loadVendors = async () => {
    const rows = await apiFetch<Vendor[]>("/it/admin/vendors");
    setVendors(rows);
  };
  const loadLicenses = async () => {
    const rows = await apiFetch<License[]>("/it/admin/licenses");
    setLicenses(rows);
  };
  const loadAssignments = async (licenseId: number) => {
    const rows = await apiFetch<LicenseAssignment[]>(`/it/admin/license-assignments?license_id=${encodeURIComponent(String(licenseId))}`);
    setAssignments(rows);
  };

  const loadAll = async () => {
    setError(null);
    try {
      await Promise.all([loadVendors(), loadLicenses()]);
    } catch (e: any) {
      setError(e?.message || "Failed to load licenses data");
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!selectedLicenseId) {
      setAssignments([]);
      return;
    }
    void loadAssignments(selectedLicenseId);
  }, [selectedLicenseId]);

  const addVendor = async () => {
    if (!vendorName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<Vendor>("/it/admin/vendors", {
        method: "POST",
        body: JSON.stringify({ name: vendorName.trim() }),
      });
      setVendorName("");
      await loadVendors();
    } catch (e: any) {
      setError(e?.message || "Failed to add vendor");
    } finally {
      setBusy(false);
    }
  };

  const addLicense = async () => {
    if (!licenseForm.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<License>("/it/admin/licenses", {
        method: "POST",
        body: JSON.stringify({
          name: licenseForm.name.trim(),
          vendor_id: licenseForm.vendor_id ? Number(licenseForm.vendor_id) : null,
          sku: licenseForm.sku.trim() || null,
          license_type: licenseForm.license_type,
          billing_cycle: licenseForm.billing_cycle,
          total_seats: Number(licenseForm.total_seats || "1"),
          contract_start: toIsoOrNull(licenseForm.contract_start),
          contract_end: toIsoOrNull(licenseForm.contract_end),
          renewal_date: toIsoOrNull(licenseForm.renewal_date),
          registered_email: licenseForm.registered_email.trim() || null,
          cost_currency: licenseForm.cost_currency.trim() || "INR",
          cost_amount: licenseForm.cost_amount ? Number(licenseForm.cost_amount) : null,
          notes: licenseForm.notes.trim() || null,
          is_active: true,
        }),
      });
      setLicenseForm({
        name: "",
        vendor_id: "",
        sku: "",
        license_type: "SUBSCRIPTION",
        total_seats: "1",
        billing_cycle: "ANNUAL",
        contract_start: "",
        contract_end: "",
        renewal_date: "",
        registered_email: "",
        cost_amount: "",
        cost_currency: "INR",
        notes: "",
      });
      await loadLicenses();
    } catch (e: any) {
      setError(e?.message || "Failed to add license");
    } finally {
      setBusy(false);
    }
  };

  const addAssignment = async () => {
    if (!selectedLicenseId) return;
    if (!assignmentForm.assignee_email.trim() && !assignmentForm.assignee_name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<LicenseAssignment>("/it/admin/license-assignments", {
        method: "POST",
        body: JSON.stringify({
          license_id: selectedLicenseId,
          asset_id: assignmentForm.asset_id ? Number(assignmentForm.asset_id) : null,
          assignee_email: assignmentForm.assignee_email.trim() || null,
          assignee_name: assignmentForm.assignee_name.trim() || null,
          status: assignmentForm.status.trim() || "ASSIGNED",
          notes: assignmentForm.notes.trim() || null,
        }),
      });
      setAssignmentForm({ asset_id: "", assignee_email: "", assignee_name: "", status: "ASSIGNED", notes: "" });
      await loadAssignments(selectedLicenseId);
    } catch (e: any) {
      setError(e?.message || "Failed to add assignment");
    } finally {
      setBusy(false);
    }
  };

  const downloadLicenseSample = () => {
    downloadText(
      "it-licenses-sample.csv",
      [
        "name,vendor,sku,license_type,billing_cycle,total_seats,contract_start,contract_end,renewal_date,registered_email,cost_currency,cost_amount,notes",
        "Notion,Notion,TEAM,SUBSCRIPTION,ANNUAL,10,2025-01-10,2026-01-10,2026-01-10,admin@company.com,INR,25000,Workspace seats",
      ].join("\n")
    );
  };

  const uploadLicenseCsv = async (file: File) => {
    const validation = validateCsvFile(file);
    if (validation) {
      setCsvError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    setCsvError(null);
    try {
      const formData = new FormData();
      formData.append("upload", file);
      const res = await fetch(`${API_BASE}/it/admin/licenses/import`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      await loadAll();
    } catch (e: any) {
      setError(e?.message || "License CSV import failed");
    } finally {
      setBusy(false);
      if (licenseInputRef.current) licenseInputRef.current.value = "";
      setLicenseCsvFile(null);
    }
  };

  const downloadAssignmentSample = () => {
    downloadText(
      "it-license-assignments-sample.csv",
      ["license_id,asset_id,assignee_email,assignee_name,status,notes", "1,2,devdutt.kumar@studiolotus.in,Devdutt,ASSIGNED,Seat assignment"].join("\n")
    );
  };

  const uploadAssignmentCsv = async (file: File) => {
    const validation = validateCsvFile(file);
    if (validation) {
      setCsvError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    setCsvError(null);
    try {
      const formData = new FormData();
      formData.append("upload", file);
      const res = await fetch(`${API_BASE}/it/admin/license-assignments/import`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      await loadAll();
      if (selectedLicenseId) await loadAssignments(selectedLicenseId);
    } catch (e: any) {
      setError(e?.message || "Assignments CSV import failed");
    } finally {
      setBusy(false);
      if (assignmentCsvRef.current) assignmentCsvRef.current.value = "";
      setAssignmentCsvFile(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="section-card">
        <h1 className="text-2xl font-semibold">Software Licenses</h1>
        <p className="mt-2 text-steel">Track vendors, seats, renewals, and assignments.</p>
      </section>

      {error ? (
        <section className="section-card border border-rose-500/20 bg-rose-500/10 text-rose-700">{error}</section>
      ) : null}
      {csvError ? (
        <section className="section-card border border-rose-500/20 bg-rose-500/10 text-rose-700">{csvError}</section>
      ) : null}

      <section className="section-card">
        <h2 className="text-lg font-semibold">Vendors</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            className="flex-1 min-w-[240px] rounded-xl border border-black/10 bg-white/60 px-4 py-2"
            placeholder="Vendor name"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !vendorName.trim()}
            onClick={() => void addVendor()}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Add vendor
          </button>
        </div>
      </section>

      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Add license</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold" onClick={downloadLicenseSample}>
              Sample CSV
            </button>
            <label className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold cursor-pointer">
              Choose CSV
              <input
                ref={licenseInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setCsvError(null);
                  setLicenseCsvFile(file);
                }}
              />
            </label>
            <button
              type="button"
              className="rounded-full border border-black/10 bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy || !licenseCsvFile}
              onClick={() => licenseCsvFile && void uploadLicenseCsv(licenseCsvFile)}
            >
              Upload CSV
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="License name" value={licenseForm.name} onChange={(e) => setLicenseForm((s) => ({ ...s, name: e.target.value }))} />
          <select className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" value={licenseForm.vendor_id} onChange={(e) => setLicenseForm((s) => ({ ...s, vendor_id: e.target.value }))}>
            <option value="">Select vendor</option>
            {vendors.map((v) => (
              <option key={v.vendor_id} value={String(v.vendor_id)}>
                {v.name}
              </option>
            ))}
          </select>
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="SKU / plan" value={licenseForm.sku} onChange={(e) => setLicenseForm((s) => ({ ...s, sku: e.target.value }))} />

          <select className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" value={licenseForm.license_type} onChange={(e) => setLicenseForm((s) => ({ ...s, license_type: e.target.value }))}>
            {LICENSE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" type="number" min={1} placeholder="Total seats" value={licenseForm.total_seats} onChange={(e) => setLicenseForm((s) => ({ ...s, total_seats: e.target.value }))} />
          <select className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" value={licenseForm.billing_cycle} onChange={(e) => setLicenseForm((s) => ({ ...s, billing_cycle: e.target.value }))}>
            {BILLING_CYCLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" type="date" value={licenseForm.contract_start} onChange={(e) => setLicenseForm((s) => ({ ...s, contract_start: e.target.value }))} />
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Registered email" value={licenseForm.registered_email} onChange={(e) => setLicenseForm((s) => ({ ...s, registered_email: e.target.value }))} />
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Cost amount" value={licenseForm.cost_amount} onChange={(e) => setLicenseForm((s) => ({ ...s, cost_amount: e.target.value }))} />

          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" value={licenseForm.cost_currency} onChange={(e) => setLicenseForm((s) => ({ ...s, cost_currency: e.target.value }))} />
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" type="date" value={licenseForm.contract_end} onChange={(e) => setLicenseForm((s) => ({ ...s, contract_end: e.target.value }))} />
          <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" type="date" value={licenseForm.renewal_date} onChange={(e) => setLicenseForm((s) => ({ ...s, renewal_date: e.target.value }))} />
          <div />
        </div>

        <textarea className="mt-3 w-full rounded-xl border border-black/10 bg-white/60 px-4 py-3" placeholder="Notes" value={licenseForm.notes} onChange={(e) => setLicenseForm((s) => ({ ...s, notes: e.target.value }))} />

        <div className="mt-4 flex justify-start">
          <button type="button" disabled={busy || !licenseForm.name.trim()} onClick={() => void addLicense()} className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
            Save license
          </button>
        </div>
      </section>

      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Licenses</h2>
          <select className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold" value={selectedLicenseId ? String(selectedLicenseId) : ""} onChange={(e) => setSelectedLicenseId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select license for assignments</option>
            {licenses.map((l) => (
              <option key={l.license_id} value={String(l.license_id)}>
                {l.name} (#{l.license_id})
              </option>
            ))}
          </select>
        </div>
        {!licenses.length ? <p className="mt-4 text-sm text-steel">No licenses yet.</p> : null}
      </section>

      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Assignments</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold" onClick={downloadAssignmentSample}>
              Sample CSV
            </button>
            <label className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold cursor-pointer">
              Choose CSV
              <input
                ref={assignmentCsvRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setCsvError(null);
                  setAssignmentCsvFile(file);
                }}
              />
            </label>
            <button
              type="button"
              className="rounded-full border border-black/10 bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy || !assignmentCsvFile}
              onClick={() => assignmentCsvFile && void uploadAssignmentCsv(assignmentCsvFile)}
            >
              Upload CSV
            </button>
          </div>
        </div>

        {!selectedLicense ? <p className="mt-3 text-sm text-steel">Pick a license to assign seats.</p> : null}

        {selectedLicense ? (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Asset ID (optional)" value={assignmentForm.asset_id} onChange={(e) => setAssignmentForm((s) => ({ ...s, asset_id: e.target.value }))} />
              <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Assignee email" value={assignmentForm.assignee_email} onChange={(e) => setAssignmentForm((s) => ({ ...s, assignee_email: e.target.value }))} />
              <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Assignee name" value={assignmentForm.assignee_name} onChange={(e) => setAssignmentForm((s) => ({ ...s, assignee_name: e.target.value }))} />
              <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Status" value={assignmentForm.status} onChange={(e) => setAssignmentForm((s) => ({ ...s, status: e.target.value }))} />
              <input className="rounded-xl border border-black/10 bg-white/60 px-4 py-2" placeholder="Notes" value={assignmentForm.notes} onChange={(e) => setAssignmentForm((s) => ({ ...s, notes: e.target.value }))} />
            </div>
            <div className="mt-4">
              <button type="button" disabled={busy} onClick={() => void addAssignment()} className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
                Add assignment
              </button>
            </div>

            <div className="mt-6">
              <p className="text-sm text-steel">
                Showing assignments for <span className="font-semibold text-slate-900">{selectedLicense.name}</span>
              </p>
              {!assignments.length ? <p className="mt-3 text-sm text-steel">No assignments yet.</p> : null}
              {assignments.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-slate-600">
                      <tr>
                        <th className="py-2 pr-4">Asset ID</th>
                        <th className="py-2 pr-4">Assignee</th>
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4">Assigned</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-800">
                      {assignments.map((a) => (
                        <tr key={a.assignment_id} className="border-t border-white/40">
                          <td className="py-2 pr-4">{a.asset_id ?? "-"}</td>
                          <td className="py-2 pr-4 font-semibold">{a.assignee_name || "-"}</td>
                          <td className="py-2 pr-4">{a.assignee_email || "-"}</td>
                          <td className="py-2 pr-4">{new Date(a.assigned_at).toLocaleDateString()}</td>
                          <td className="py-2 pr-4">{a.status || "-"}</td>
                          <td className="py-2 pr-4">{a.notes || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
