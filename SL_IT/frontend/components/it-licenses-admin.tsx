"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";

type Vendor = {
  vendor_id: number;
  name: string;
  is_active: boolean;
};

type License = {
  license_id: number;
  vendor_id?: number | null;
  name: string;
  sku?: string | null;
  license_type: string;
  total_seats: number;
  assigned_seats?: number | null;
  billing_cycle?: string | null;
  renewal_date?: string | null;
  registered_email?: string | null;
  cost_amount?: number | null;
  cost_currency?: string | null;
  is_active: boolean;
};

type Assignment = {
  assignment_id: number;
  license_id: number;
  asset_id?: number | null;
  assigned_person_id?: string | null;
  assigned_email?: string | null;
  assigned_name?: string | null;
  status: string;
  assigned_at?: string | null;
  unassigned_at?: string | null;
};

const licenseTypes = ["SUBSCRIPTION", "PERPETUAL", "CONCURRENT", "NAMED_USER", "DEVICE"];
const billingCycles = ["MONTHLY", "ANNUAL", "ONE_TIME"];
const assignmentStatuses = ["ACTIVE", "REVOKED", "EXPIRED"];

export function ItLicensesAdmin() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedLicenseId, setSelectedLicenseId] = useState<number | "">("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string>("");
  const [assignmentFile, setAssignmentFile] = useState<File | null>(null);
  const [assignmentResult, setAssignmentResult] = useState<string>("");
  const [vendorName, setVendorName] = useState("");
  const [licenseForm, setLicenseForm] = useState({
    vendor_id: "",
    name: "",
    sku: "",
    license_type: "SUBSCRIPTION",
    total_seats: 1,
    billing_cycle: "ANNUAL",
    renewal_date: "",
    registered_email: "",
    cost_amount: "",
    cost_currency: "INR",
    notes: "",
  });
  const [assignmentForm, setAssignmentForm] = useState({
    asset_id: "",
    assigned_email: "",
    assigned_name: "",
    assigned_person_id: "",
    status: "ACTIVE",
  });

  const loadVendors = () => {
    apiFetch<Vendor[]>("/it/admin/vendors")
      .then(setVendors)
      .catch(() => setVendors([]));
  };

  const loadLicenses = () => {
    apiFetch<License[]>("/it/admin/licenses")
      .then(setLicenses)
      .catch(() => setLicenses([]));
  };

  const loadAssignments = (licenseId: number) => {
    apiFetch<Assignment[]>(`/it/admin/licenses/${licenseId}/assignments`)
      .then(setAssignments)
      .catch(() => setAssignments([]));
  };

  useEffect(() => {
    loadVendors();
    loadLicenses();
  }, []);

  useEffect(() => {
    if (selectedLicenseId) {
      loadAssignments(Number(selectedLicenseId));
    } else {
      setAssignments([]);
    }
  }, [selectedLicenseId]);

  const selectedLicense = useMemo(
    () => licenses.find((license) => license.license_id === Number(selectedLicenseId)),
    [licenses, selectedLicenseId]
  );

  const createVendor = async () => {
    if (!vendorName.trim()) return;
    await apiFetch("/it/admin/vendors", {
      method: "POST",
      body: JSON.stringify({ name: vendorName, is_active: true }),
    });
    setVendorName("");
    loadVendors();
  };

  const createLicense = async () => {
    if (!licenseForm.name.trim()) return;
    await apiFetch("/it/admin/licenses", {
      method: "POST",
      body: JSON.stringify({
        vendor_id: licenseForm.vendor_id ? Number(licenseForm.vendor_id) : null,
        name: licenseForm.name.trim(),
        sku: licenseForm.sku || null,
        license_type: licenseForm.license_type,
        total_seats: Number(licenseForm.total_seats),
        billing_cycle: licenseForm.billing_cycle || null,
        renewal_date: licenseForm.renewal_date || null,
        registered_email: licenseForm.registered_email || null,
        cost_amount: licenseForm.cost_amount ? Number(licenseForm.cost_amount) : null,
        cost_currency: licenseForm.cost_currency || null,
        notes: licenseForm.notes || null,
        is_active: true,
      }),
    });
    setLicenseForm({
      vendor_id: "",
      name: "",
      sku: "",
      license_type: "SUBSCRIPTION",
      total_seats: 1,
      billing_cycle: "ANNUAL",
      renewal_date: "",
      registered_email: "",
      cost_amount: "",
      cost_currency: "INR",
      notes: "",
    });
    loadLicenses();
  };

  const createAssignment = async () => {
    if (!selectedLicenseId) return;
    await apiFetch(`/it/admin/licenses/${selectedLicenseId}/assignments`, {
      method: "POST",
      body: JSON.stringify({
        asset_id: assignmentForm.asset_id ? Number(assignmentForm.asset_id) : null,
        assigned_email: assignmentForm.assigned_email || null,
        assigned_name: assignmentForm.assigned_name || null,
        assigned_person_id: assignmentForm.assigned_person_id || null,
        status: assignmentForm.status,
      }),
    });
    setAssignmentForm({
      asset_id: "",
      assigned_email: "",
      assigned_name: "",
      assigned_person_id: "",
      status: "ACTIVE",
    });
    loadAssignments(Number(selectedLicenseId));
    loadLicenses();
  };

  const revokeAssignment = async (assignmentId: number) => {
    await apiFetch(`/it/admin/assignments/${assignmentId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "REVOKED",
        unassigned_at: new Date().toISOString(),
      }),
    });
    if (selectedLicenseId) {
      loadAssignments(Number(selectedLicenseId));
      loadLicenses();
    }
  };

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  const importLicenses = async () => {
    if (!importFile) return;
    setImportResult("Uploading...");
    const formData = new FormData();
    formData.append("file", importFile);
    const res = await fetch(`${basePath}/api/it/admin/licenses/import`, {
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
    loadLicenses();
  };

  const importAssignments = async () => {
    if (!assignmentFile) return;
    setAssignmentResult("Uploading...");
    const formData = new FormData();
    formData.append("file", assignmentFile);
    const res = await fetch(`${basePath}/api/it/admin/assignments/import`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) {
      setAssignmentResult(data?.detail || "Import failed");
      return;
    }
    setAssignmentResult(`Imported ${data.inserted} rows, ${data.errors.length} errors`);
    setAssignmentFile(null);
    loadLicenses();
  };

  return (
    <div className="space-y-6">
      <section className="section-card">
        <h2 className="text-xl font-semibold">Vendors</h2>
        <div className="mt-4 flex gap-3">
          <input
            className="flex-1 rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Vendor name"
            value={vendorName}
            onChange={(event) => setVendorName(event.target.value)}
          />
          <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white" onClick={createVendor}>
            Add vendor
          </button>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-steel">
          {vendors.map((vendor) => (
            <div key={vendor.vendor_id} className="rounded-xl bg-white/80 px-4 py-2">
              {vendor.name}
            </div>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Add license</h2>
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
            <a
              href={`${basePath}/templates/licenses_import_sample.csv`}
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
              onClick={importLicenses}
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
            placeholder="License name"
            value={licenseForm.name}
            onChange={(event) => setLicenseForm({ ...licenseForm, name: event.target.value })}
          />
          <select
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            value={licenseForm.vendor_id}
            onChange={(event) => setLicenseForm({ ...licenseForm, vendor_id: event.target.value })}
          >
            <option value="">Select vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.vendor_id} value={vendor.vendor_id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="SKU / plan"
            value={licenseForm.sku}
            onChange={(event) => setLicenseForm({ ...licenseForm, sku: event.target.value })}
          />
          <select
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            value={licenseForm.license_type}
            onChange={(event) => setLicenseForm({ ...licenseForm, license_type: event.target.value })}
          >
            {licenseTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            type="number"
            min={1}
            placeholder="Total seats"
            value={licenseForm.total_seats}
            onChange={(event) =>
              setLicenseForm({ ...licenseForm, total_seats: Number(event.target.value) })
            }
          />
          <select
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            value={licenseForm.billing_cycle}
            onChange={(event) => setLicenseForm({ ...licenseForm, billing_cycle: event.target.value })}
          >
            {billingCycles.map((cycle) => (
              <option key={cycle} value={cycle}>
                {cycle}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            type="date"
            value={licenseForm.renewal_date}
            onChange={(event) => setLicenseForm({ ...licenseForm, renewal_date: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Registered email"
            value={licenseForm.registered_email}
            onChange={(event) => setLicenseForm({ ...licenseForm, registered_email: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Cost amount"
            value={licenseForm.cost_amount}
            onChange={(event) => setLicenseForm({ ...licenseForm, cost_amount: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Currency (INR)"
            value={licenseForm.cost_currency}
            onChange={(event) => setLicenseForm({ ...licenseForm, cost_currency: event.target.value })}
          />
        </div>
        <textarea
          className="mt-3 w-full rounded-xl border border-black/10 bg-white px-4 py-2"
          placeholder="Notes"
          value={licenseForm.notes}
          onChange={(event) => setLicenseForm({ ...licenseForm, notes: event.target.value })}
        />
        <button className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white" onClick={createLicense}>
          Save license
        </button>
      </section>

      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Licenses</h2>
          <select
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm"
            value={selectedLicenseId}
            onChange={(event) => setSelectedLicenseId(event.target.value ? Number(event.target.value) : "")}
          >
            <option value="">Select license for assignments</option>
            {licenses.map((license) => (
              <option key={license.license_id} value={license.license_id}>
                {license.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 grid gap-3">
          {licenses.map((license) => (
            <div key={license.license_id} className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{license.name}</div>
                  <div className="text-xs text-steel">
                    {license.license_type} · Seats {license.assigned_seats || 0}/{license.total_seats}
                  </div>
                </div>
                <div className="text-xs text-steel">
                  Renewal {license.renewal_date || "NA"}
                </div>
              </div>
              <div className="mt-2 text-xs text-steel">
                {license.registered_email || "No registered email"} {license.sku ? `• ${license.sku}` : ""}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Assignments</h2>
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
            <a
              href={`${basePath}/templates/assignments_import_sample.csv`}
              className="rounded-full border border-black/10 px-3 py-1"
            >
              Sample CSV
            </a>
            <label className="rounded-full border border-black/10 px-3 py-1">
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(event) => setAssignmentFile(event.target.files?.[0] || null)}
              />
              {assignmentFile ? "File selected" : "Choose CSV"}
            </label>
            <button
              className="rounded-full bg-ink px-3 py-1 text-white disabled:opacity-50"
              onClick={importAssignments}
              disabled={!assignmentFile}
            >
              Upload
            </button>
          </div>
        </div>
        {!selectedLicenseId && <p className="mt-2 text-sm text-steel">Pick a license to assign seats.</p>}
        {selectedLicenseId && (
          <>
            {assignmentResult && <div className="mt-3 text-xs text-steel">{assignmentResult}</div>}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input
                className="rounded-xl border border-black/10 bg-white px-4 py-2"
                placeholder="Asset ID (optional)"
                value={assignmentForm.asset_id}
                onChange={(event) => setAssignmentForm({ ...assignmentForm, asset_id: event.target.value })}
              />
              <input
                className="rounded-xl border border-black/10 bg-white px-4 py-2"
                placeholder="Person ID (optional)"
                value={assignmentForm.assigned_person_id}
                onChange={(event) =>
                  setAssignmentForm({ ...assignmentForm, assigned_person_id: event.target.value })
                }
              />
              <input
                className="rounded-xl border border-black/10 bg-white px-4 py-2"
                placeholder="Assignee email"
                value={assignmentForm.assigned_email}
                onChange={(event) => setAssignmentForm({ ...assignmentForm, assigned_email: event.target.value })}
              />
              <input
                className="rounded-xl border border-black/10 bg-white px-4 py-2"
                placeholder="Assignee name"
                value={assignmentForm.assigned_name}
                onChange={(event) => setAssignmentForm({ ...assignmentForm, assigned_name: event.target.value })}
              />
              <select
                className="rounded-xl border border-black/10 bg-white px-4 py-2"
                value={assignmentForm.status}
                onChange={(event) => setAssignmentForm({ ...assignmentForm, status: event.target.value })}
              >
                {assignmentStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white"
              onClick={createAssignment}
            >
              Assign seat
            </button>
            <div className="mt-4 grid gap-2">
              {assignments.map((assignment) => (
                <div key={assignment.assignment_id} className="rounded-xl bg-white/80 px-4 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>
                      {assignment.assigned_name || "Unassigned"}{" "}
                      {assignment.assigned_email ? `• ${assignment.assigned_email}` : ""}
                    </span>
                    <span className="text-xs text-steel">{assignment.status}</span>
                  </div>
                  <div className="mt-2 text-xs text-steel">
                    Asset {assignment.asset_id || "NA"} · Person {assignment.assigned_person_id || "NA"}
                  </div>
                  {assignment.status === "ACTIVE" && (
                    <button
                      className="mt-2 rounded-full border border-black/10 px-3 py-1 text-xs font-semibold"
                      onClick={() => revokeAssignment(assignment.assignment_id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
              {!assignments.length && (
                <div className="text-sm text-steel">No assignments yet for this license.</div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
