"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
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

export function ItAdminSettings() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicy[]>([]);
  const [routingRules, setRoutingRules] = useState<RoutingRule[]>([]);
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

  return (
    <div className="space-y-8">
      <section className="section-card">
        <h2 className="text-lg font-semibold">Categories</h2>
        <div className="mt-4 flex gap-3">
          <input
            className="flex-1 rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="New category name"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
          />
          <button className="px-4 py-2 rounded-full bg-ink text-white" onClick={createCategory}>
            Add
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {categories.map((category) => (
            <div key={category.category_id} className="flex items-center justify-between rounded-xl bg-white px-4 py-2">
              <span>{category.name}</span>
              <span className="text-xs text-steel">{category.is_active ? "Active" : "Inactive"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h2 className="text-lg font-semibold">Subcategories</h2>
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
          <button className="rounded-full bg-ink px-4 py-2 text-white" onClick={createSubcategory}>
            Add
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {subcategories.map((subcategory) => {
            const category = categories.find((item) => item.category_id === subcategory.category_id);
            return (
              <div key={subcategory.subcategory_id} className="rounded-xl bg-white px-4 py-2">
                <div className="font-semibold">{subcategory.name}</div>
                <div className="text-xs text-steel">
                  {category?.name || "Unassigned"} · {subcategory.is_active ? "Active" : "Inactive"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section-card">
        <h2 className="text-lg font-semibold">SLA Policies</h2>
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
        <button className="mt-4 px-4 py-2 rounded-full bg-ink text-white" onClick={createSla}>
          Add SLA
        </button>
        <div className="mt-4 grid gap-2">
          {slaPolicies.map((policy) => (
            <div key={policy.sla_policy_id} className="rounded-xl bg-white px-4 py-2">
              <div className="font-semibold">{policy.name}</div>
              <div className="text-xs text-steel">
                First response {policy.first_response_minutes}m, resolution {policy.resolution_minutes}m
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h2 className="text-lg font-semibold">Routing Rules</h2>
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
        <button className="mt-4 rounded-full bg-ink px-4 py-2 text-white" onClick={createRoutingRule}>
          Add routing rule
        </button>
        <div className="mt-4 grid gap-2">
          {routingRules.map((rule) => {
            const category = categories.find((item) => item.category_id === rule.category_id);
            const subcategory = subcategories.find((item) => item.subcategory_id === rule.subcategory_id);
            return (
              <div key={rule.rule_id} className="rounded-xl bg-white px-4 py-2">
                <div className="font-semibold">{category?.name || "Any category"}</div>
                <div className="text-xs text-steel">
                  {subcategory?.name || "Any subcategory"} · Assignee {rule.default_assignee_person_id || "Unassigned"}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
