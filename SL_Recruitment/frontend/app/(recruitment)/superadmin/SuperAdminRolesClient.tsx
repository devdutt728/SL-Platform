"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Check, Edit3, Plus, Trash2, UserPlus } from "lucide-react";
import type { PlatformPersonSuggestion, PlatformRole } from "@/lib/types";

type RoleForm = {
  role_id: string;
  role_code: string;
  role_name: string;
};

function formatPersonRoles(person: PlatformPersonSuggestion | null): string {
  if (!person) return "";
  const names = (person.role_names || []).filter(Boolean);
  const codes = (person.role_codes || []).filter(Boolean);
  if (names.length) return names.join(", ");
  if (codes.length) return codes.join(", ");
  if (person.role_name) return person.role_name;
  if (person.role_code) return person.role_code;
  return "";
}

const emptyForm: RoleForm = {
  role_id: "",
  role_code: "",
  role_name: "",
};

export function SuperAdminRolesClient() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const [personQuery, setPersonQuery] = useState("");
  const [personOptions, setPersonOptions] = useState<PlatformPersonSuggestion[]>([]);
  const [personSelected, setPersonSelected] = useState<PlatformPersonSuggestion | null>(null);
  const [personOpen, setPersonOpen] = useState(false);
  const [personLoading, setPersonLoading] = useState(false);
  const [assignRoleIds, setAssignRoleIds] = useState<number[]>([]);
  const personMenuRef = useRef<HTMLDivElement | null>(null);

  async function loadRoles() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/platform/roles`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as PlatformRole[];
      setRoles(data);
    } catch (e: any) {
      setError(e?.message || "Could not load roles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRoles();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = personQuery.trim();
    if (!personOpen) return;
    const handle = window.setTimeout(() => {
      (async () => {
        setPersonLoading(true);
        try {
          const res = await fetch(`${basePath}/api/platform/people?q=${encodeURIComponent(q)}&limit=10`, { cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as PlatformPersonSuggestion[];
          if (!cancelled) setPersonOptions(data);
        } catch {
          // ignore
        } finally {
          if (!cancelled) setPersonLoading(false);
        }
      })();
    }, q.length < 2 ? 0 : 200);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [personQuery, personOpen]);

  useEffect(() => {
    if (!personSelected) {
      setAssignRoleIds([]);
    }
  }, [personSelected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return roles;
    }
    return roles.filter((role) => {
      const code = (role.role_code || "").toLowerCase();
      const name = (role.role_name || "").toLowerCase();
      return code.includes(q) || name.includes(q) || String(role.role_id).includes(q);
    });
  }, [roles, search]);

  async function createRole() {
    setError(null);
    setNotice(null);
    const payload: Record<string, unknown> = {
      role_code: form.role_code.trim(),
      role_name: form.role_name.trim() || null,
    };
    if (form.role_id.trim()) payload.role_id = Number(form.role_id.trim());
    try {
      const res = await fetch(`${basePath}/api/platform/roles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadRoles();
      setForm(emptyForm);
      setNotice("Role created.");
      window.setTimeout(() => setNotice(null), 2000);
    } catch (e: any) {
      setError(e?.message || "Could not create role.");
    }
  }

  async function saveRole(roleId: number, updates: Partial<RoleForm>) {
    setError(null);
    setNotice(null);
    const payload: Record<string, unknown> = {};
    if (updates.role_code != null) payload.role_code = updates.role_code.trim();
    if (updates.role_name != null) payload.role_name = updates.role_name.trim() || null;
    try {
      const res = await fetch(`${basePath}/api/platform/roles/${roleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadRoles();
      setEditingId(null);
      setNotice("Role updated.");
      window.setTimeout(() => setNotice(null), 2000);
    } catch (e: any) {
      setError(e?.message || "Could not update role.");
    }
  }

  async function deleteRole(roleId: number) {
    if (!window.confirm("Delete this role?")) return;
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${basePath}/api/platform/roles/${roleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      await loadRoles();
      setNotice("Role deleted.");
      window.setTimeout(() => setNotice(null), 2000);
    } catch (e: any) {
      setError(e?.message || "Could not delete role.");
    }
  }

  async function assignRole() {
    if (!personSelected) {
      setError("Select a person to assign a role.");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${basePath}/api/platform/roles/assign/${encodeURIComponent(personSelected.person_id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role_ids: assignRoleIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNotice("Role assignment updated.");
      window.setTimeout(() => setNotice(null), 2000);
      setPersonSelected(null);
      setPersonQuery("");
      setAssignRoleIds([]);
    } catch (e: any) {
      setError(e?.message || "Could not assign role.");
    }
  }

  return (
    <main className="content-pad space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <div className="absolute -right-10 top-6 h-40 w-40 rounded-full bg-sky-200/40 blur-3xl" aria-hidden="true" />
        <div className="absolute -left-8 bottom-6 h-28 w-28 rounded-full bg-cyan-200/40 blur-2xl" aria-hidden="true" />
        <div className="relative space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">SuperAdmin</p>
          <h1 className="text-2xl font-semibold text-slate-900">Role Studio</h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Create, edit, and assign platform roles. Superadmin only.
          </p>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-tight text-slate-500">Create role</p>
              <h2 className="text-lg font-semibold text-slate-900">New platform role</h2>
              <p className="text-xs text-slate-500">Role ID is optional; it auto-increments if left blank.</p>
            </div>
            <button
              type="button"
              onClick={() => void createRole()}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm"
            >
              <Plus className="h-4 w-4" /> Create
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-xs text-slate-600">
              Role ID (optional)
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                value={form.role_id}
                onChange={(e) => setForm((prev) => ({ ...prev, role_id: e.target.value }))}
                placeholder="Auto"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              Role code
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                value={form.role_code}
                onChange={(e) => setForm((prev) => ({ ...prev, role_code: e.target.value }))}
                placeholder="e.g. HR_ADMIN"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              Role name
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                value={form.role_name}
                onChange={(e) => setForm((prev) => ({ ...prev, role_name: e.target.value }))}
                placeholder="e.g. HR Admin"
              />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-tight text-slate-500">Assign role</p>
              <h2 className="text-lg font-semibold text-slate-900">Person access</h2>
            </div>
            <UserPlus className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-4 space-y-3">
            <label className="space-y-1 text-xs text-slate-600">
              Person
              <div className="relative" ref={personMenuRef}>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={personSelected ? `${personSelected.full_name} (${personSelected.email})` : personQuery}
                  onChange={(e) => {
                    setPersonSelected(null);
                    setPersonQuery(e.target.value);
                  }}
                  onFocus={() => setPersonOpen(true)}
                  onBlur={() => window.setTimeout(() => setPersonOpen(false), 150)}
                  placeholder="Search by name or email"
                />
                {personLoading ? (
                  <div className="absolute right-3 top-2 text-xs text-slate-400">Searching...</div>
                ) : null}
                {!personSelected && personOpen && personOptions.length > 0 ? (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
                    {personOptions.map((person) => (
                      <button
                        key={person.person_id}
                        type="button"
                        className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          setPersonSelected(person);
                          setPersonOptions([]);
                          setAssignRoleIds((person.role_ids || []).slice());
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {person.full_name} <span className="text-slate-500">({person.email})</span>
                          </span>
                          {formatPersonRoles(person) ? (
                            <span className="block truncate text-xs text-slate-400">{formatPersonRoles(person)}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">{person.person_id}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>
            {roles.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-600">Roles</p>
                <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-700 sm:grid-cols-2">
                  {roles.map((role) => {
                    const checked = assignRoleIds.includes(role.role_id);
                    return (
                      <label key={role.role_id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setAssignRoleIds((prev) => {
                              if (prev.includes(role.role_id)) {
                                return prev.filter((id) => id !== role.role_id);
                              }
                              return [...prev, role.role_id];
                            });
                          }}
                        />
                        <span className="truncate">
                          <span className="font-medium">{role.role_code}</span>
                          {role.role_name ? ` - ${role.role_name}` : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {personSelected && assignRoleIds.length === 0 ? (
                  <p className="text-xs text-slate-500">No roles selected.</p>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => void assignRole()}
              className="w-full rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm"
            >
              Save assignment
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-tight text-slate-500">Roles</p>
            <h2 className="text-lg font-semibold text-slate-900">Role registry</h2>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-700"
              placeholder="Search roles"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[120px_1fr_1fr_160px] gap-2 border-b border-slate-200 bg-white/70 px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
            <span>ID</span>
            <span>Code</span>
            <span>Name</span>
            <span className="text-center">Actions</span>
          </div>
          <div className="divide-y divide-slate-200">
            {loading ? (
              <div className="px-3 py-3 text-sm text-slate-600">Loading roles...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-600">No roles found.</div>
            ) : (
              filtered.map((role) => {
                const editing = editingId === role.role_id;
                return (
                  <div key={role.role_id} className="grid grid-cols-[120px_1fr_1fr_160px] gap-2 px-3 py-3 text-sm text-slate-800">
                    <span className="font-semibold">{role.role_id}</span>
                    {editing ? (
                      <input
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={role.role_code}
                        onChange={(e) => setRoles((prev) => prev.map((r) => (r.role_id === role.role_id ? { ...r, role_code: e.target.value } : r)))}
                      />
                    ) : (
                      <span className="font-medium">{role.role_code}</span>
                    )}
                    {editing ? (
                      <input
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={role.role_name || ""}
                        onChange={(e) => setRoles((prev) => prev.map((r) => (r.role_id === role.role_id ? { ...r, role_name: e.target.value } : r)))}
                      />
                    ) : (
                      <span className="text-slate-600">{role.role_name || "-"}</span>
                    )}
                    <div className="flex items-center justify-center gap-2">
                      {editing ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                          onClick={() => {
                            const updated = roles.find((r) => r.role_id === role.role_id);
                            if (!updated) return;
                            void saveRole(role.role_id, {
                              role_code: updated.role_code,
                              role_name: updated.role_name || "",
                            });
                          }}
                        >
                          <Check className="h-3.5 w-3.5" /> Save
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                          onClick={() => setEditingId(role.role_id)}
                        >
                          <Edit3 className="h-3.5 w-3.5" /> Edit
                        </button>
                      )}
                      <button
                        type="button"
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                          "border border-rose-200 bg-rose-50 text-rose-700"
                        )}
                        onClick={() => void deleteRole(role.role_id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
