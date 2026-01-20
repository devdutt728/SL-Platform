"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileUp, Plus, Search, Trash2 } from "lucide-react";
import type { PlatformPerson, PlatformPersonSuggestion } from "@/lib/types";

type PersonForm = {
  person_id: string;
  person_code: string;
  personal_id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_number: string;
  role_id: string;
  grade_id: string;
  department_id: string;
  manager_id: string;
  employment_type: string;
  join_date: string;
  exit_date: string;
  status: string;
  is_deleted: string;
  created_at: string;
  updated_at: string;
  source_system: string;
  full_name: string;
  display_name: string;
};

type BulkResult = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string; person_id?: string | null }[];
};

const emptyForm: PersonForm = {
  person_id: "",
  person_code: "",
  personal_id: "",
  first_name: "",
  last_name: "",
  email: "",
  mobile_number: "",
  role_id: "",
  grade_id: "",
  department_id: "",
  manager_id: "",
  employment_type: "",
  join_date: "",
  exit_date: "",
  status: "",
  is_deleted: "",
  created_at: "",
  updated_at: "",
  source_system: "",
  full_name: "",
  display_name: "",
};

function toInputDate(value?: string | null) {
  if (!value) return "";
  return value.includes("T") ? value.split("T")[0] : value;
}

function toInputDateTime(value?: string | null) {
  if (!value) return "";
  if (value.includes("T")) return value.slice(0, 16);
  return value;
}

function fromInputDate(value: string) {
  return value.trim() ? value.trim() : null;
}

function fromInputDateTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length === 16 ? `${trimmed}:00` : trimmed;
}

function toForm(person: PlatformPerson): PersonForm {
  return {
    person_id: person.person_id || "",
    person_code: person.person_code || "",
    personal_id: person.personal_id || "",
    first_name: person.first_name || "",
    last_name: person.last_name || "",
    email: person.email || "",
    mobile_number: person.mobile_number || "",
    role_id: person.role_id != null ? String(person.role_id) : "",
    grade_id: person.grade_id != null ? String(person.grade_id) : "",
    department_id: person.department_id != null ? String(person.department_id) : "",
    manager_id: person.manager_id || "",
    employment_type: person.employment_type || "",
    join_date: toInputDate(person.join_date),
    exit_date: toInputDate(person.exit_date),
    status: person.status || "",
    is_deleted: person.is_deleted != null ? String(person.is_deleted) : "",
    created_at: toInputDateTime(person.created_at),
    updated_at: toInputDateTime(person.updated_at),
    source_system: person.source_system || "",
    full_name: person.full_name || "",
    display_name: person.display_name || "",
  };
}

export function SuperAdminPeopleClient() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PlatformPersonSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selected, setSelected] = useState<PlatformPersonSuggestion | null>(null);
  const [form, setForm] = useState<PersonForm>(emptyForm);
  const [mode, setMode] = useState<"create" | "edit">("edit");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkOverwrite, setBulkOverwrite] = useState(false);
  const [bulkReplaceAll, setBulkReplaceAll] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (!open) return;
    const handle = window.setTimeout(() => {
      (async () => {
        setLoadingOptions(true);
        try {
          const res = await fetch(`${basePath}/api/platform/people?q=${encodeURIComponent(q)}&limit=10`, {
            cache: "no-store",
          });
          if (!res.ok) return;
          const data = (await res.json()) as PlatformPersonSuggestion[];
          if (!cancelled) setOptions(data);
        } catch {
          // ignore
        } finally {
          if (!cancelled) setLoadingOptions(false);
        }
      })();
    }, q.length < 2 ? 0 : 200);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, open]);

  const selectedLabel = useMemo(() => {
    if (!selected) return "";
    return `${selected.full_name} (${selected.email})`;
  }, [selected]);

  async function loadPerson(personId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/platform/people/${encodeURIComponent(personId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as PlatformPerson;
      setForm(toForm(data));
      setMode("edit");
    } catch (err: any) {
      setError(err?.message || "Failed to load person.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm(emptyForm);
    setMode("create");
    setSelected(null);
    setQuery("");
  }

  function updateField<K extends keyof PersonForm>(key: K, value: PersonForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function normalizePayload() {
    const payload: Record<string, unknown> = {
      person_id: form.person_id.trim(),
      person_code: form.person_code.trim(),
      personal_id: form.personal_id.trim() || null,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      email: form.email.trim(),
      mobile_number: form.mobile_number.trim() || null,
      role_id: form.role_id.trim() ? Number(form.role_id.trim()) : null,
      grade_id: form.grade_id.trim() ? Number(form.grade_id.trim()) : null,
      department_id: form.department_id.trim() ? Number(form.department_id.trim()) : null,
      manager_id: form.manager_id.trim() || null,
      employment_type: form.employment_type.trim() || null,
      join_date: fromInputDate(form.join_date),
      exit_date: fromInputDate(form.exit_date),
      status: form.status.trim() || null,
      is_deleted: form.is_deleted.trim() ? Number(form.is_deleted.trim()) : null,
      created_at: fromInputDateTime(form.created_at),
      updated_at: fromInputDateTime(form.updated_at),
      source_system: form.source_system.trim() || null,
      full_name: form.full_name.trim() || null,
      display_name: form.display_name.trim() || null,
    };
    return payload;
  }

  async function savePerson() {
    setError(null);
    setNotice(null);
    const payload = normalizePayload();
    try {
      const url =
        mode === "create"
          ? `${basePath}/api/platform/people`
          : `${basePath}/api/platform/people/${encodeURIComponent(form.person_id)}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "create" ? payload : stripPersonId(payload)),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as PlatformPerson;
      setForm(toForm(data));
      setMode("edit");
      setNotice(mode === "create" ? "Person created." : "Changes saved.");
      window.setTimeout(() => setNotice(null), 2000);
    } catch (err: any) {
      setError(err?.message || "Failed to save person.");
    }
  }

  async function deletePerson() {
    if (!form.person_id.trim()) return;
    if (!window.confirm("Mark this person as deleted?")) return;
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${basePath}/api/platform/people/${encodeURIComponent(form.person_id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      setNotice("Person marked as deleted.");
      window.setTimeout(() => setNotice(null), 2000);
      resetForm();
    } catch (err: any) {
      setError(err?.message || "Failed to delete person.");
    }
  }

  async function uploadCsv() {
    if (!bulkFile) {
      setBulkError("Select a CSV file.");
      return;
    }
    if (bulkReplaceAll && !window.confirm("This will TRUNCATE dim_person and dim_person_role. Continue?")) {
      return;
    }
    setBulkError(null);
    setBulkResult(null);
    const formData = new FormData();
    formData.append("file", bulkFile);
    formData.append("overwrite", String(bulkOverwrite));
    formData.append("replace_all", String(bulkReplaceAll));
    try {
      const res = await fetch(`${basePath}/api/platform/people/bulk`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as BulkResult;
      setBulkResult(data);
    } catch (err: any) {
      setBulkError(err?.message || "Bulk upload failed.");
    }
  }

  function downloadTemplate() {
    const headers = [
      "person_id",
      "person_code",
      "personal_id",
      "first_name",
      "last_name",
      "email",
      "mobile_number",
      "role_id",
      "grade_id",
      "department_id",
      "manager_id",
      "employment_type",
      "join_date",
      "exit_date",
      "status",
      "is_deleted",
      "created_at",
      "updated_at",
      "source_system",
      "full_name",
      "display_name",
    ];
    const blob = new Blob([`${headers.join(",")}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dim_person_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadSample() {
    const headers = [
      "person_id",
      "person_code",
      "personal_id",
      "first_name",
      "last_name",
      "email",
      "mobile_number",
      "role_id",
      "grade_id",
      "department_id",
      "manager_id",
      "employment_type",
      "join_date",
      "exit_date",
      "status",
      "is_deleted",
      "created_at",
      "updated_at",
      "source_system",
      "full_name",
      "display_name",
    ];
    const rows = [
      [
        "EMP_1001",
        "SLP1001",
        "A12345",
        "Asha",
        "Kapoor",
        "asha.kapoor@studiolotus.in",
        "9876543210",
        "5",
        "3",
        "12",
        "EMP_1000",
        "Full-Time",
        "2024-06-10",
        "",
        "working",
        "0",
        "2024-06-10T09:30",
        "2025-01-05T11:15",
        "hrms",
        "Asha Kapoor",
        "Asha",
      ],
      [
        "EMP_1002",
        "SLP1002",
        "",
        "Rohan",
        "Mehta",
        "rohan.mehta@studiolotus.in",
        "9123456789",
        "3",
        "2",
        "14",
        "EMP_1000",
        "Contract",
        "2024-09-01",
        "",
        "working",
        "0",
        "2024-09-01T10:00",
        "2024-12-20T17:45",
        "manual",
        "Rohan Mehta",
        "Rohan",
      ],
    ];
    const body = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([`${headers.join(",")}\n${body}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dim_person_sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <div className="absolute -right-10 top-6 h-40 w-40 rounded-full bg-amber-200/30 blur-3xl" aria-hidden="true" />
        <div className="absolute -left-8 bottom-6 h-28 w-28 rounded-full bg-lime-200/30 blur-2xl" aria-hidden="true" />
        <div className="relative space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">SuperAdmin</p>
          <h2 className="text-2xl font-semibold text-slate-900">People Studio</h2>
          <p className="max-w-2xl text-sm text-slate-600">
            Edit dim_person records, manage deletions, or bulk upload updates with overwrite control.
          </p>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-tight text-slate-500">Select person</p>
              <h3 className="text-lg font-semibold text-slate-900">Load record</h3>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            >
              <Plus className="h-4 w-4" /> New person
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="space-y-1 text-xs text-slate-600">
              Search person
              <div className="relative" ref={menuRef}>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={selected ? selectedLabel : query}
                  onChange={(e) => {
                    setSelected(null);
                    setQuery(e.target.value);
                  }}
                  onFocus={() => setOpen(true)}
                  onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                  placeholder="Search by name, email, or person code"
                />
                {loadingOptions ? <div className="absolute right-3 top-2 text-xs text-slate-400">Searching...</div> : null}
                {!selected && open && options.length > 0 ? (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
                    {options.map((person) => (
                      <button
                        key={person.person_id}
                        type="button"
                        className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          setSelected(person);
                          setOptions([]);
                          setQuery("");
                          void loadPerson(person.person_id);
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {person.full_name} <span className="text-slate-500">({person.email})</span>
                          </span>
                          <span className="block truncate text-xs text-slate-400">{person.person_code}</span>
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">{person.person_id}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-tight text-slate-500">Bulk upload</p>
              <h3 className="text-lg font-semibold text-slate-900">CSV import</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
              >
                <Search className="h-3.5 w-3.5" /> Template
              </button>
              <button
                type="button"
                onClick={downloadSample}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
              >
                <FileUp className="h-3.5 w-3.5" /> Sample
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <input type="file" accept=".csv" onChange={(e) => setBulkFile(e.target.files?.[0] || null)} />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={bulkOverwrite} onChange={(e) => setBulkOverwrite(e.target.checked)} />
              Overwrite existing records (by email)
            </label>
            <label className="flex items-center gap-2 text-xs text-rose-600">
              <input
                type="checkbox"
                checked={bulkReplaceAll}
                onChange={(e) => setBulkReplaceAll(e.target.checked)}
              />
              Replace all data (TRUNCATE dim_person + dim_person_role)
            </label>
            <button
              type="button"
              onClick={() => void uploadCsv()}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm"
            >
              <FileUp className="h-4 w-4" /> Upload CSV
            </button>
            {bulkError ? <p className="text-xs text-rose-600">{bulkError}</p> : null}
            {bulkResult ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-600">
                <p>
                  Total: {bulkResult.total} | Created: {bulkResult.created} | Updated: {bulkResult.updated} | Skipped:{" "}
                  {bulkResult.skipped}
                </p>
                {bulkResult.errors.length ? (
                  <div className="mt-2 max-h-28 overflow-auto text-rose-700">
                    {bulkResult.errors.map((err) => (
                      <p key={`${err.row}-${err.person_id || ""}`}>
                        Row {err.row}: {err.message} {err.person_id ? `(${err.person_id})` : ""}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-tight text-slate-500">Person details</p>
            <h3 className="text-lg font-semibold text-slate-900">Dim person editor</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void savePerson()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
            >
              <Check className="h-4 w-4" /> {mode === "create" ? "Create" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => void deletePerson()}
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Field label="Person ID" value={form.person_id} onChange={(val) => updateField("person_id", val)} disabled={mode === "edit"} />
          <Field label="Person Code" value={form.person_code} onChange={(val) => updateField("person_code", val)} />
          <Field label="Personal ID" value={form.personal_id} onChange={(val) => updateField("personal_id", val)} />
          <Field label="First Name" value={form.first_name} onChange={(val) => updateField("first_name", val)} />
          <Field label="Last Name" value={form.last_name} onChange={(val) => updateField("last_name", val)} />
          <Field label="Email" value={form.email} onChange={(val) => updateField("email", val)} type="email" />
          <Field label="Mobile Number" value={form.mobile_number} onChange={(val) => updateField("mobile_number", val)} />
          <Field label="Role ID" value={form.role_id} onChange={(val) => updateField("role_id", val)} type="number" />
          <Field label="Grade ID" value={form.grade_id} onChange={(val) => updateField("grade_id", val)} type="number" />
          <Field label="Department ID" value={form.department_id} onChange={(val) => updateField("department_id", val)} type="number" />
          <Field label="Manager ID" value={form.manager_id} onChange={(val) => updateField("manager_id", val)} />
          <Field label="Employment Type" value={form.employment_type} onChange={(val) => updateField("employment_type", val)} />
          <Field label="Join Date" value={form.join_date} onChange={(val) => updateField("join_date", val)} type="date" />
          <Field label="Exit Date" value={form.exit_date} onChange={(val) => updateField("exit_date", val)} type="date" />
          <Field label="Status" value={form.status} onChange={(val) => updateField("status", val)} />
          <Field label="Is Deleted (0/1)" value={form.is_deleted} onChange={(val) => updateField("is_deleted", val)} type="number" />
          <Field label="Created At" value={form.created_at} onChange={(val) => updateField("created_at", val)} type="datetime-local" />
          <Field label="Updated At" value={form.updated_at} onChange={(val) => updateField("updated_at", val)} type="datetime-local" />
          <Field label="Source System" value={form.source_system} onChange={(val) => updateField("source_system", val)} />
          <Field label="Full Name" value={form.full_name} onChange={(val) => updateField("full_name", val)} />
          <Field label="Display Name" value={form.display_name} onChange={(val) => updateField("display_name", val)} />
        </div>
      </section>
    </section>
  );
}

function stripPersonId(payload: Record<string, unknown>) {
  const copy = { ...payload };
  delete copy.person_id;
  return copy;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1 text-xs text-slate-600">
      {label}
      <input
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:bg-slate-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        disabled={disabled}
      />
    </label>
  );
}
