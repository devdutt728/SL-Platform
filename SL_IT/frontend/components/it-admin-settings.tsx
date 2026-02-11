"use client";

import { useEffect, useRef, useState } from "react";

import { API_BASE, apiFetch } from "@/lib/api";
import type { Category, Subcategory } from "@/lib/types";

interface SlaPolicy {
  sla_policy_id: number;
  name: string;
  category_id?: number | null;
  priority?: string | null;
  first_response_minutes: number;
  resolution_minutes: number;
  is_active: boolean;
}

interface RoutingRule {
  rule_id: number;
  category_id?: number | null;
  subcategory_id?: number | null;
  default_assignee_person_id?: string | null;
  is_active: boolean;
}

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

export function ItAdminSettings() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicy[]>([]);
  const [routingRules, setRoutingRules] = useState<RoutingRule[]>([]);
  const [categoryEdits, setCategoryEdits] = useState<Record<number, { name: string; is_active: boolean }>>({});
  const [subcategoryEdits, setSubcategoryEdits] = useState<
    Record<number, { category_id: number; name: string; is_active: boolean }>
  >({});
  const [slaEdits, setSlaEdits] = useState<
    Record<number, { name: string; first_response_minutes: number; resolution_minutes: number; is_active: boolean }>
  >({});
  const [routingEdits, setRoutingEdits] = useState<
    Record<number, { category_id: number | null; subcategory_id: number | null; default_assignee_person_id: string; is_active: boolean }>
  >({});
  const [categoryName, setCategoryName] = useState("");
  const [subcategoryForm, setSubcategoryForm] = useState({ category_id: "", name: "" });
  const [slaForm, setSlaForm] = useState({
    name: "",
    first_response_minutes: 60,
    resolution_minutes: 480,
  });
  const [routingForm, setRoutingForm] = useState({
    category_id: "",
    subcategory_id: "",
    default_assignee_person_id: "",
  });
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [policyBusy, setPolicyBusy] = useState(false);
  const policyInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = () => {
    apiFetch<Category[]>("/it/admin/categories")
      .then(setCategories)
      .catch(() => setCategories([]));
    apiFetch<Subcategory[]>("/it/admin/subcategories")
      .then(setSubcategories)
      .catch(() => setSubcategories([]));
    apiFetch<SlaPolicy[]>("/it/admin/sla")
      .then(setSlaPolicies)
      .catch(() => setSlaPolicies([]));
    apiFetch<RoutingRule[]>("/it/admin/routing")
      .then(setRoutingRules)
      .catch(() => setRoutingRules([]));
  };

  useEffect(() => {
    loadData();
  }, []);

  const downloadPolicyTemplate = () => {
    downloadText(
      "it-policies-template.csv",
      [
        "record_type,name,category_name,category_id,subcategory_name,subcategory_id,first_response_minutes,resolution_minutes,priority,default_assignee_person_id,is_active",
        "category,Access & Login,,,,,,,,true",
        "category,File & Folder,,,,,,,,true",
        "category,Hardware,,,,,,,,true",
        "subcategory,Login issue,Access & Login,,,,,,,true",
        "subcategory,Access issue,Access & Login,,,,,,,true",
        "subcategory,Folder creation,File & Folder,,,,,,,true",
        "subcategory,Hardware issue,Hardware,,,,,,,true",
        "sla,Login issue,Access & Login,,,,15,15,,,true",
        "sla,Access issue,Access & Login,,,,15,15,,,true",
        "sla,Folder creation,File & Folder,,,,30,30,,,true",
        "sla,Hardware issue,Hardware,,,,120,1440,,,true",
        "routing,,Access & Login,,Login issue,,,,SACHIN_PERSON_ID,true",
        "routing,,Access & Login,,Access issue,,,,NITAYEE_PERSON_ID,true",
      ].join("\n")
    );
  };

  const uploadPolicyCsv = async (file: File) => {
    const validation = validateCsvFile(file);
    if (validation) {
      setPolicyError(validation);
      return;
    }
    setPolicyBusy(true);
    setPolicyError(null);
    setPolicyMessage(null);
    try {
      const formData = new FormData();
      formData.append("upload", file);
      const res = await fetch(`${API_BASE}/it/admin/policies/import`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setPolicyMessage(
        `Imported categories ${result.created?.categories || 0}, subcategories ${result.created?.subcategories || 0}, SLA ${result.created?.sla || 0}, routing ${result.created?.routing || 0}.`
      );
      setPolicyFile(null);
      if (policyInputRef.current) policyInputRef.current.value = "";
      loadData();
    } catch (e: any) {
      setPolicyError(e?.message || "CSV import failed");
    } finally {
      setPolicyBusy(false);
    }
  };

  const createCategory = async () => {
    if (!categoryName.trim()) return;
    await apiFetch("/it/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name: categoryName, is_active: true }),
    });
    setCategoryName("");
    loadData();
  };

  const createSubcategory = async () => {
    if (!subcategoryForm.name.trim() || !subcategoryForm.category_id) return;
    await apiFetch("/it/admin/subcategories", {
      method: "POST",
      body: JSON.stringify({
        category_id: Number(subcategoryForm.category_id),
        name: subcategoryForm.name,
        is_active: true,
      }),
    });
    setSubcategoryForm({ category_id: "", name: "" });
    loadData();
  };

  const createSla = async () => {
    await apiFetch("/it/admin/sla", {
      method: "POST",
      body: JSON.stringify({
        name: slaForm.name,
        first_response_minutes: slaForm.first_response_minutes,
        resolution_minutes: slaForm.resolution_minutes,
        is_active: true,
      }),
    });
    setSlaForm({ name: "", first_response_minutes: 60, resolution_minutes: 480 });
    loadData();
  };

  const createRoutingRule = async () => {
    await apiFetch("/it/admin/routing", {
      method: "POST",
      body: JSON.stringify({
        category_id: routingForm.category_id ? Number(routingForm.category_id) : null,
        subcategory_id: routingForm.subcategory_id ? Number(routingForm.subcategory_id) : null,
        default_assignee_person_id: routingForm.default_assignee_person_id || null,
        is_active: true,
      }),
    });
    setRoutingForm({ category_id: "", subcategory_id: "", default_assignee_person_id: "" });
    loadData();
  };

  const saveCategory = async (categoryId: number) => {
    const edit = categoryEdits[categoryId];
    if (!edit) return;
    await apiFetch(`/it/admin/categories/${categoryId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: edit.name, is_active: edit.is_active }),
    });
    loadData();
  };

  const deactivateCategory = async (categoryId: number) => {
    await apiFetch(`/it/admin/categories/${categoryId}`, { method: "DELETE" });
    loadData();
  };

  const saveSubcategory = async (subcategoryId: number) => {
    const edit = subcategoryEdits[subcategoryId];
    if (!edit) return;
    await apiFetch(`/it/admin/subcategories/${subcategoryId}`, {
      method: "PATCH",
      body: JSON.stringify({
        category_id: edit.category_id,
        name: edit.name,
        is_active: edit.is_active,
      }),
    });
    loadData();
  };

  const deactivateSubcategory = async (subcategoryId: number) => {
    await apiFetch(`/it/admin/subcategories/${subcategoryId}`, { method: "DELETE" });
    loadData();
  };

  const saveSla = async (policyId: number) => {
    const edit = slaEdits[policyId];
    if (!edit) return;
    await apiFetch(`/it/admin/sla/${policyId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: edit.name,
        first_response_minutes: edit.first_response_minutes,
        resolution_minutes: edit.resolution_minutes,
        is_active: edit.is_active,
      }),
    });
    loadData();
  };

  const deactivateSla = async (policyId: number) => {
    await apiFetch(`/it/admin/sla/${policyId}`, { method: "DELETE" });
    loadData();
  };

  const saveRouting = async (ruleId: number) => {
    const edit = routingEdits[ruleId];
    if (!edit) return;
    await apiFetch(`/it/admin/routing/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({
        category_id: edit.category_id,
        subcategory_id: edit.subcategory_id,
        default_assignee_person_id: edit.default_assignee_person_id || null,
        is_active: edit.is_active,
      }),
    });
    loadData();
  };

  const deactivateRouting = async (ruleId: number) => {
    await apiFetch(`/it/admin/routing/${ruleId}`, { method: "DELETE" });
    loadData();
  };

  return (
    <div className="space-y-8">
      <section className="section-card">
        <h2 className="text-lg font-semibold">Bulk import (CSV)</h2>
        <p className="mt-2 text-sm text-steel">
          Upload one CSV to create categories, subcategories, SLA policies, and routing rules in a single step.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold"
            onClick={downloadPolicyTemplate}
          >
            Download template CSV
          </button>
          <label className="rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold cursor-pointer">
            Choose CSV
            <input
              ref={policyInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={policyBusy}
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setPolicyError(null);
                setPolicyMessage(null);
                setPolicyFile(file);
              }}
            />
          </label>
          <button
            type="button"
            className="rounded-full border border-black/10 bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={policyBusy || !policyFile}
            onClick={() => policyFile && void uploadPolicyCsv(policyFile)}
          >
            Import CSV
          </button>
        </div>
        {policyError ? <p className="mt-2 text-sm text-rose-600">{policyError}</p> : null}
        {policyMessage ? <p className="mt-2 text-sm text-emerald-600">{policyMessage}</p> : null}
      </section>
      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Categories</h2>
          <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-steel">
            {categories.length} total
          </span>
        </div>
        <div className="mt-4 flex gap-3">
          <input
            className="flex-1 rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="New category name"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
          />
          <button className="px-4 py-2 rounded-full bg-brand text-white" onClick={createCategory}>
            Add
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {categories.map((category) => {
            const edit = categoryEdits[category.category_id] || {
              name: category.name,
              is_active: category.is_active,
            };
            return (
              <div
                key={category.category_id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-card"
              >
                <input
                  className="min-w-[220px] flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  value={edit.name}
                  onChange={(event) =>
                    setCategoryEdits((prev) => ({
                      ...prev,
                      [category.category_id]: { ...edit, name: event.target.value },
                    }))
                  }
                />
                <label className="flex items-center gap-2 text-xs text-steel">
                  <input
                    type="checkbox"
                    checked={edit.is_active}
                    onChange={(event) =>
                      setCategoryEdits((prev) => ({
                        ...prev,
                        [category.category_id]: { ...edit, is_active: event.target.checked },
                      }))
                    }
                  />
                  Active
                </label>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold"
                    onClick={() => void saveCategory(category.category_id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700"
                    onClick={() => void deactivateCategory(category.category_id)}
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Subcategories</h2>
          <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-steel">
            {subcategories.length} total
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            value={subcategoryForm.category_id}
            onChange={(event) => setSubcategoryForm({ ...subcategoryForm, category_id: event.target.value })}
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.category_id} value={category.category_id}>
                {category.name}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Subcategory name"
            value={subcategoryForm.name}
            onChange={(event) => setSubcategoryForm({ ...subcategoryForm, name: event.target.value })}
          />
          <button className="rounded-full bg-brand px-4 py-2 text-white" onClick={createSubcategory}>
            Add
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {subcategories.map((subcategory) => {
            const edit = subcategoryEdits[subcategory.subcategory_id] || {
              category_id: subcategory.category_id,
              name: subcategory.name,
              is_active: subcategory.is_active,
            };
            return (
              <div
                key={subcategory.subcategory_id}
                className="grid gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-card md:grid-cols-[minmax(0,1fr)_160px_100px_auto]"
              >
                <input
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  value={edit.name}
                  onChange={(event) =>
                    setSubcategoryEdits((prev) => ({
                      ...prev,
                      [subcategory.subcategory_id]: { ...edit, name: event.target.value },
                    }))
                  }
                />
                <select
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  value={String(edit.category_id)}
                  onChange={(event) =>
                    setSubcategoryEdits((prev) => ({
                      ...prev,
                      [subcategory.subcategory_id]: {
                        ...edit,
                        category_id: Number(event.target.value),
                      },
                    }))
                  }
                >
                  {categories.map((category) => (
                    <option key={category.category_id} value={category.category_id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs text-steel">
                  <input
                    type="checkbox"
                    checked={edit.is_active}
                    onChange={(event) =>
                      setSubcategoryEdits((prev) => ({
                        ...prev,
                        [subcategory.subcategory_id]: { ...edit, is_active: event.target.checked },
                      }))
                    }
                  />
                  Active
                </label>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <button
                    type="button"
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold"
                    onClick={() => void saveSubcategory(subcategory.subcategory_id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700"
                    onClick={() => void deactivateSubcategory(subcategory.subcategory_id)}
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">SLA Policies</h2>
          <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-steel">
            {slaPolicies.length} total
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Policy name"
            value={slaForm.name}
            onChange={(event) => setSlaForm({ ...slaForm, name: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            type="number"
            placeholder="First response (min)"
            value={slaForm.first_response_minutes}
            onChange={(event) =>
              setSlaForm({ ...slaForm, first_response_minutes: Number(event.target.value) })
            }
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            type="number"
            placeholder="Resolution (min)"
            value={slaForm.resolution_minutes}
            onChange={(event) =>
              setSlaForm({ ...slaForm, resolution_minutes: Number(event.target.value) })
            }
          />
        </div>
        <button className="mt-4 px-4 py-2 rounded-full bg-brand text-white" onClick={createSla}>
          Add SLA
        </button>
        <div className="mt-4 grid gap-2">
          {slaPolicies.map((policy) => {
            const edit = slaEdits[policy.sla_policy_id] || {
              name: policy.name,
              first_response_minutes: policy.first_response_minutes,
              resolution_minutes: policy.resolution_minutes,
              is_active: policy.is_active,
            };
            return (
              <div
                key={policy.sla_policy_id}
                className="grid gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-card md:grid-cols-[minmax(0,1fr)_160px_160px_100px_auto]"
              >
                <input
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  value={edit.name}
                  onChange={(event) =>
                    setSlaEdits((prev) => ({
                      ...prev,
                      [policy.sla_policy_id]: { ...edit, name: event.target.value },
                    }))
                  }
                />
                <input
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  type="number"
                  min={1}
                  value={edit.first_response_minutes}
                  onChange={(event) =>
                    setSlaEdits((prev) => ({
                      ...prev,
                      [policy.sla_policy_id]: {
                        ...edit,
                        first_response_minutes: Number(event.target.value),
                      },
                    }))
                  }
                />
                <input
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  type="number"
                  min={1}
                  value={edit.resolution_minutes}
                  onChange={(event) =>
                    setSlaEdits((prev) => ({
                      ...prev,
                      [policy.sla_policy_id]: {
                        ...edit,
                        resolution_minutes: Number(event.target.value),
                      },
                    }))
                  }
                />
                <label className="flex items-center gap-2 text-xs text-steel">
                  <input
                    type="checkbox"
                    checked={edit.is_active}
                    onChange={(event) =>
                      setSlaEdits((prev) => ({
                        ...prev,
                        [policy.sla_policy_id]: { ...edit, is_active: event.target.checked },
                      }))
                    }
                  />
                  Active
                </label>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <button
                    type="button"
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold"
                    onClick={() => void saveSla(policy.sla_policy_id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700"
                    onClick={() => void deactivateSla(policy.sla_policy_id)}
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="section-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Routing Rules</h2>
          <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-steel">
            {routingRules.length} total
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            value={routingForm.category_id}
            onChange={(event) => setRoutingForm({ ...routingForm, category_id: event.target.value })}
          >
            <option value="">Category</option>
            {categories.map((category) => (
              <option key={category.category_id} value={category.category_id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            value={routingForm.subcategory_id}
            onChange={(event) => setRoutingForm({ ...routingForm, subcategory_id: event.target.value })}
          >
            <option value="">Subcategory</option>
            {subcategories.map((subcategory) => (
              <option key={subcategory.subcategory_id} value={subcategory.subcategory_id}>
                {subcategory.name}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Default assignee person_id"
            value={routingForm.default_assignee_person_id}
            onChange={(event) =>
              setRoutingForm({ ...routingForm, default_assignee_person_id: event.target.value })
            }
          />
        </div>
        <button className="mt-4 rounded-full bg-brand px-4 py-2 text-white" onClick={createRoutingRule}>
          Add routing rule
        </button>
        <div className="mt-4 grid gap-2">
          {routingRules.map((rule) => {
            const edit = routingEdits[rule.rule_id] || {
              category_id: rule.category_id ?? null,
              subcategory_id: rule.subcategory_id ?? null,
              default_assignee_person_id: rule.default_assignee_person_id || "",
              is_active: rule.is_active,
            };
            return (
              <div
                key={rule.rule_id}
                className="grid gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-card md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_100px_auto]"
              >
                <select
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  value={edit.category_id ?? ""}
                  onChange={(event) =>
                    setRoutingEdits((prev) => ({
                      ...prev,
                      [rule.rule_id]: {
                        ...edit,
                        category_id: event.target.value ? Number(event.target.value) : null,
                      },
                    }))
                  }
                >
                  <option value="">Any category</option>
                  {categories.map((category) => (
                    <option key={category.category_id} value={category.category_id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  value={edit.subcategory_id ?? ""}
                  onChange={(event) =>
                    setRoutingEdits((prev) => ({
                      ...prev,
                      [rule.rule_id]: {
                        ...edit,
                        subcategory_id: event.target.value ? Number(event.target.value) : null,
                      },
                    }))
                  }
                >
                  <option value="">Any subcategory</option>
                  {subcategories.map((subcategory) => (
                    <option key={subcategory.subcategory_id} value={subcategory.subcategory_id}>
                      {subcategory.name}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  placeholder="Default assignee person_id"
                  value={edit.default_assignee_person_id}
                  onChange={(event) =>
                    setRoutingEdits((prev) => ({
                      ...prev,
                      [rule.rule_id]: { ...edit, default_assignee_person_id: event.target.value },
                    }))
                  }
                />
                <label className="flex items-center gap-2 text-xs text-steel">
                  <input
                    type="checkbox"
                    checked={edit.is_active}
                    onChange={(event) =>
                      setRoutingEdits((prev) => ({
                        ...prev,
                        [rule.rule_id]: { ...edit, is_active: event.target.checked },
                      }))
                    }
                  />
                  Active
                </label>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <button
                    type="button"
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold"
                    onClick={() => void saveRouting(rule.rule_id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700"
                    onClick={() => void deactivateRouting(rule.rule_id)}
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

