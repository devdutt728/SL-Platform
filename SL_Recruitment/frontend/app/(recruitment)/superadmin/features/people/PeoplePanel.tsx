"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileUp, Plus, Search, SlidersHorizontal, Trash2, UserCircle2 } from "lucide-react";
import type { PlatformPerson, PlatformPersonSuggestion } from "@/lib/types";
import { PERSON_CSV_HEADERS, PERSON_CSV_SAMPLE_ROWS } from "./constants";
import {
  fromInputDate,
  fromInputDateTime,
  getStatusBadge,
  stripPersonId,
  toPersonForm,
} from "./helpers";
import { type BulkResult, emptyPersonForm, type PersonForm } from "./types";

export function PeoplePanel() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PlatformPersonSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selected, setSelected] = useState<PlatformPersonSuggestion | null>(null);
  const [form, setForm] = useState<PersonForm>(emptyPersonForm);
  const [mode, setMode] = useState<"create" | "edit">("edit");
  const [includeDeleted, setIncludeDeleted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkDryRun, setBulkDryRun] = useState(false);
  const [bulkReplaceAll, setBulkReplaceAll] = useState(false);
  const [bulkReplaceConfirm, setBulkReplaceConfirm] = useState("");
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
          const params = new URLSearchParams();
          params.set("q", q);
          params.set("limit", "25");
          if (includeDeleted) params.set("include_deleted", "true");
          const res = await fetch(`${basePath}/api/platform/people?${params.toString()}`, { cache: "no-store" });
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
  }, [basePath, query, open, includeDeleted]);

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
      setForm(toPersonForm(data));
      setMode("edit");
    } catch (err: any) {
      setError(err?.message || "Failed to load person.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm(emptyPersonForm);
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
      source_candidate_id: form.source_candidate_id.trim() ? Number(form.source_candidate_id.trim()) : null,
      source_candidate_code: form.source_candidate_code.trim() || null,
      full_name: form.full_name.trim() || null,
      display_name: form.display_name.trim() || null,
    };
    return payload;
  }

  async function savePerson() {
    setError(null);
    setNotice(null);
    if (mode === "edit" && !form.person_id.trim()) {
      setError("Load a person record before saving.");
      return;
    }
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
      setForm(toPersonForm(data));
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

  async function uploadBulk() {
    if (!bulkFile) {
      setBulkError("Select a CSV or XLSX file.");
      return;
    }
    setBulkError(null);
    setBulkResult(null);
    if (bulkReplaceAll && !bulkDryRun && bulkReplaceConfirm.trim() !== "REPLACE_DIM_PERSON") {
      setBulkError("Type REPLACE_DIM_PERSON to run one-time full reload.");
      return;
    }
    const formData = new FormData();
    formData.append("file", bulkFile);
    formData.append("dry_run", String(bulkDryRun));
    formData.append("replace_all", String(bulkReplaceAll));
    if (bulkReplaceAll) formData.append("confirm_replace", bulkReplaceConfirm.trim());
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
    const blob = new Blob([`${PERSON_CSV_HEADERS.join(",")}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dim_person_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadSample() {
    const body = PERSON_CSV_SAMPLE_ROWS.map((row) => row.join(",")).join("\n");
    const blob = new Blob([`${PERSON_CSV_HEADERS.join(",")}\n${body}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dim_person_sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const formStatusBadge = getStatusBadge(
    form.status,
    form.is_deleted.trim() ? Number(form.is_deleted.trim()) : null
  );
  const formName = (form.display_name || form.full_name || `${form.first_name} ${form.last_name}`.trim()).trim();
  const formMeta = [form.person_code, form.person_id].filter(Boolean).join(" / ");
  const canSavePerson = !loading && (mode === "create" || Boolean(form.person_id.trim()));
  const canDeletePerson = Boolean(form.person_id.trim());

  return (
    <section className="space-y-4">
      <section className="relative isolate overflow-hidden rounded-[26px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-100/80 p-5 shadow-[0_24px_44px_-34px_rgba(15,23,42,0.58)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-40 [background:linear-gradient(115deg,transparent_0%,rgba(15,23,42,0.08)_50%,transparent_100%)]"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute -right-12 top-3 h-28 w-28 rounded-full bg-amber-200/30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-8 bottom-4 h-20 w-20 rounded-full bg-cyan-200/35 blur-2xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">SuperAdmin Console</p>
            <h2 className="text-xl font-semibold text-slate-900">People Studio</h2>
            <p className="max-w-2xl text-xs text-slate-600">
              Edit dim_person records, manage deletions, and run safe bulk merge without person_id rewrites.
            </p>
          </div>
          <div className="min-w-[220px] rounded-2xl border border-slate-200/80 bg-white/85 px-3.5 py-2.5 text-xs text-slate-600 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.75)]">
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Workspace</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{mode === "create" ? "New person" : "Edit person"}</p>
            <p className="truncate text-xs text-slate-500">{formName || "No record loaded"}</p>
            {formStatusBadge ? (
              <span className={`mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${formStatusBadge.className}`}>
                {formStatusBadge.label}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-700">{notice}</div> : null}

      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="relative overflow-visible rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-[0_22px_42px_-36px_rgba(15,23,42,0.6)]">
          <div className="pointer-events-none absolute -left-10 top-5 h-20 w-20 rounded-full bg-cyan-200/35 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-16 bottom-2 h-28 w-28 rounded-full bg-emerald-200/35 blur-[64px]" aria-hidden="true" />
          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">People Search</p>
              <h3 className="text-base font-semibold text-slate-900">Load record</h3>
              <p className="mt-1 text-xs text-slate-500">Neural index for people, roles, and lifecycle status.</p>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700 shadow-sm"
            >
              <Plus className="h-4 w-4" /> New person
            </button>
          </div>

          <div className="relative mt-4 grid gap-3">
            <label className="space-y-1 text-xs text-slate-600">
              Search person
              <div className="relative" ref={menuRef}>
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-2xl border border-slate-200/85 bg-slate-900/[0.03] py-2.5 pl-10 pr-20 text-sm text-slate-800 shadow-inner focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={selected ? selectedLabel : query}
                  onChange={(e) => {
                    setSelected(null);
                    setQuery(e.target.value);
                  }}
                  onFocus={() => setOpen(true)}
                  onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                  placeholder="Search by name, email, or person code"
                />
                <div className="pointer-events-none absolute right-3 top-2.5 text-[9px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                  live
                </div>
                {loadingOptions ? <div className="absolute right-3 top-10 text-[11px] text-slate-400">Indexing...</div> : null}
                {!selected && open && options.length > 0 ? (
                  <div className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_20px_34px_-26px_rgba(15,23,42,0.62)]">
                    {options.map((person) => {
                      const badge = getStatusBadge(person.status, person.is_deleted ?? null);
                      return (
                        <button
                          key={person.person_id}
                          type="button"
                          className="flex w-full items-start justify-between gap-3 border-b border-slate-100/80 px-4 py-3 text-left text-sm last:border-b-0 hover:bg-slate-50/80"
                          onClick={() => {
                            setSelected(person);
                            setOptions([]);
                            setQuery("");
                            void loadPerson(person.person_id);
                          }}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-slate-900">
                              {person.full_name} <span className="text-slate-500">({person.email})</span>
                            </span>
                            <span className="block truncate text-xs text-slate-400">
                              {person.person_code}
                              {person.role_name ? ` / ${person.role_name}` : ""}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-slate-400">
                            {badge ? (
                              <span className={`rounded-full border px-2 py-0.5 ${badge.className}`}>{badge.label}</span>
                            ) : null}
                            <span>{person.person_id}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {!selected && open && !loadingOptions && options.length === 0 && query.trim().length > 1 ? (
                  <div className="absolute z-10 mt-2 w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
                    No matches. Try a broader search or include relieved/deleted.
                  </div>
                ) : null}
              </div>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <SlidersHorizontal className="h-3 w-3" /> Filters
              </span>
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={includeDeleted}
                  onChange={(e) => setIncludeDeleted(e.target.checked)}
                />
                Include relieved/deleted
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/80 bg-white/85 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Bulk upload</p>
              <h3 className="text-base font-semibold text-slate-900">Safe merge import</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
              >
                <Search className="h-3.5 w-3.5" /> Template
              </button>
              <button
                type="button"
                onClick={downloadSample}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
              >
                <FileUp className="h-3.5 w-3.5" /> Sample
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-2.5">
            <input
              type="file"
              accept=".csv,.xlsx,.xlsm"
              onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
            />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={bulkDryRun} onChange={(e) => setBulkDryRun(e.target.checked)} />
              Preview only (no database changes)
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={bulkReplaceAll}
                onChange={(e) => {
                  setBulkReplaceAll(e.target.checked);
                  if (!e.target.checked) setBulkReplaceConfirm("");
                }}
              />
              One-time full reload (delete all existing dim_person rows, then import file)
            </label>
            {bulkReplaceAll ? (
              <input
                type="text"
                value={bulkReplaceConfirm}
                onChange={(e) => setBulkReplaceConfirm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                placeholder="Type REPLACE_DIM_PERSON to confirm"
              />
            ) : null}
            <button
              type="button"
              onClick={() => void uploadBulk()}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white shadow-sm"
            >
              <FileUp className="h-4 w-4" />{" "}
              {bulkReplaceAll ? (bulkDryRun ? "Preview Full Reload" : "Replace All & Upload") : (bulkDryRun ? "Preview Merge" : "Upload & Merge")}
            </button>
            <p className="text-xs text-slate-500">
              Matching priority: employee code ({`person_code`}) then email. Recruitment lineage can be stored in `source_candidate_id` and `source_candidate_code` for SLR-to-SL traceability.
            </p>
            {bulkError ? <p className="text-xs text-rose-600">{bulkError}</p> : null}
            {bulkResult ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-600">
                <p>
                  Mode: {bulkResult.mode || "apply"} | Total: {bulkResult.total} | Processed: {bulkResult.processed ?? (bulkResult.created + bulkResult.updated)} | Created: {bulkResult.created} | Updated: {bulkResult.updated} | Unchanged: {bulkResult.unchanged ?? 0} | Skipped:{" "}
                  {bulkResult.skipped} | Conflicts: {bulkResult.conflicts ?? 0}
                </p>
                {bulkResult.warnings?.length ? (
                  <div className="mt-2 max-h-24 overflow-auto text-amber-700">
                    {bulkResult.warnings.map((warn, idx) => (
                      <p key={`${warn.row || idx}-${warn.person_id || ""}`}>
                        {warn.row ? `Row ${warn.row}: ` : ""}{warn.message}
                      </p>
                    ))}
                  </div>
                ) : null}
                {bulkResult.errors.length ? (
                  <div className="mt-2 max-h-28 overflow-auto text-rose-700">
                    {bulkResult.errors.map((err) => (
                      <p key={`${err.row}-${err.person_id || ""}`}>
                        Row {err.row}: {err.message} {err.person_code ? `(${err.person_code})` : ""}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200/80 bg-white/85 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Person details</p>
            <h3 className="text-base font-semibold text-slate-900">Dim person editor</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void savePerson()}
              disabled={!canSavePerson}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white shadow-sm disabled:opacity-60"
            >
              <Check className="h-4 w-4" /> {mode === "create" ? "Create" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => void deletePerson()}
              disabled={!canDeletePerson}
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-rose-700"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-4">
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-slate-900/5 p-1.5 text-slate-600">
                  <UserCircle2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{formName || "No person loaded"}</p>
                  <p className="text-xs text-slate-500">{form.email || "Email not set"}{formMeta ? ` / ${formMeta}` : ""}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                {formStatusBadge ? (
                  <span className={`rounded-full border px-2 py-1 text-[11px] ${formStatusBadge.className}`}>
                    {formStatusBadge.label}
                  </span>
                ) : null}
                {form.employment_type ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                    {form.employment_type}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <SectionHeader title="Identity" subtitle="Core and contact details for the person record." />
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Person ID" value={form.person_id} onChange={(val) => updateField("person_id", val)} disabled={mode === "edit"} />
              <Field label="Person Code" value={form.person_code} onChange={(val) => updateField("person_code", val)} />
              <Field label="Personal ID" value={form.personal_id} onChange={(val) => updateField("personal_id", val)} />
              <Field label="First Name" value={form.first_name} onChange={(val) => updateField("first_name", val)} />
              <Field label="Last Name" value={form.last_name} onChange={(val) => updateField("last_name", val)} />
              <Field label="Email" value={form.email} onChange={(val) => updateField("email", val)} type="email" />
              <Field label="Mobile Number" value={form.mobile_number} onChange={(val) => updateField("mobile_number", val)} />
              <Field label="Display Name" value={form.display_name} onChange={(val) => updateField("display_name", val)} />
              <Field label="Full Name" value={form.full_name} onChange={(val) => updateField("full_name", val)} />
            </div>
          </div>

          <div className="space-y-2.5">
            <SectionHeader title="Employment" subtitle="Role and lifecycle details that drive activity status." />
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Role ID" value={form.role_id} onChange={(val) => updateField("role_id", val)} type="number" />
              <Field label="Grade ID" value={form.grade_id} onChange={(val) => updateField("grade_id", val)} type="number" />
              <Field label="Department ID" value={form.department_id} onChange={(val) => updateField("department_id", val)} type="number" />
              <Field label="Manager ID" value={form.manager_id} onChange={(val) => updateField("manager_id", val)} />
              <Field label="Employment Type" value={form.employment_type} onChange={(val) => updateField("employment_type", val)} />
              <Field label="Status" value={form.status} onChange={(val) => updateField("status", val)} />
              <Field label="Join Date" value={form.join_date} onChange={(val) => updateField("join_date", val)} type="date" />
              <Field label="Exit Date" value={form.exit_date} onChange={(val) => updateField("exit_date", val)} type="date" />
            </div>
          </div>

          <div className="space-y-2.5">
            <SectionHeader title="System" subtitle="Source and audit metadata for the dim_person record." />
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Is Deleted (0/1)" value={form.is_deleted} onChange={(val) => updateField("is_deleted", val)} type="number" />
              <Field label="Source System" value={form.source_system} onChange={(val) => updateField("source_system", val)} />
              <Field label="Source Candidate ID" value={form.source_candidate_id} onChange={(val) => updateField("source_candidate_id", val)} type="number" />
              <Field label="Source Candidate Code" value={form.source_candidate_code} onChange={(val) => updateField("source_candidate_code", val)} />
              <Field label="Created At" value={form.created_at} onChange={(val) => updateField("created_at", val)} type="datetime-local" />
              <Field label="Updated At" value={form.updated_at} onChange={(val) => updateField("updated_at", val)} type="datetime-local" />
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">{title}</p>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
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
    <label className="space-y-1 text-[11px] text-slate-600">
      {label}
      <input
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)] transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        disabled={disabled}
      />
    </label>
  );
}
