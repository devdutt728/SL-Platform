"use client";

import { useEffect, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiFetch } from "@/lib/api";
import type { PlatformRole, PlatformUser } from "@/lib/types";

const STATUS_OPTIONS = ["Working", "Active", "Inactive"] as const;

type NewUserState = {
  person_id: string;
  person_code: string;
  personal_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role_id: string;
  status: string;
  mobile_number: string;
  grade_id: string;
  department_id: string;
  manager_id: string;
  employment_type: string;
  join_date: string;
  exit_date: string;
  source_system: string;
  full_name: string;
  display_name: string;
};

const defaultNewUser: NewUserState = {
  person_id: "",
  person_code: "",
  personal_id: "",
  email: "",
  first_name: "",
  last_name: "",
  role_id: "",
  status: "Working",
  mobile_number: "",
  grade_id: "",
  department_id: "",
  manager_id: "",
  employment_type: "",
  join_date: "",
  exit_date: "",
  source_system: "hrms",
  full_name: "",
  display_name: "",
};

export function UserAdminTable() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [showRelievedOnly, setShowRelievedOnly] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState("");
  const [newUser, setNewUser] = useState<NewUserState>(defaultNewUser);
  const [createResult, setCreateResult] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{
    userId: string;
    roleId?: number;
    status?: string;
  } | null>(null);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  const loadUsers = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (showRelievedOnly) {
      params.set("status", "Relieved");
    } else if (statusFilter) {
      params.set("status", statusFilter);
    } else if (activeOnly) {
      params.set("status_group", "active");
    }
    if (roleFilter) params.set("role_id", roleFilter);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    apiFetch<PlatformUser[]>(`/admin/users${suffix}`)
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  const loadRoles = () => {
    apiFetch<PlatformRole[]>("/admin/roles")
      .then(setRoles)
      .catch(() => setRoles([]));
  };

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, []);

  useEffect(() => {
    loadUsers();
  }, [search, statusFilter, roleFilter, showRelievedOnly, activeOnly]);

  const requestChange = (userId: string, updates: { roleId?: number; status?: string }) => {
    setConfirm({ userId, ...updates });
  };

  const applyChange = async () => {
    if (!confirm) return;
    await apiFetch(`/admin/users/${confirm.userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role_id: confirm.roleId, status: confirm.status }),
    });
    setConfirm(null);
    loadUsers();
  };

  const stats = useMemo(() => {
    const total = users.length;
    const relieved = users.filter((user) => (user.status || "").toLowerCase() === "relieved").length;
    const active = users.filter((user) => ["working", "active"].includes((user.status || "").toLowerCase())).length;
    return { total, active, relieved };
  }, [users]);

  const normalizedQuery = search.trim().toLowerCase();
  const displayUsers = users.filter((user) => {
    if (statusFilter && user.status !== statusFilter) {
      return false;
    }
    if (showRelievedOnly && user.status !== "Relieved") {
      return false;
    }
    if (activeOnly && !statusFilter && !showRelievedOnly) {
      if (user.status && ["Relieved", "relieved"].includes(user.status)) return false;
      if (user.status && !["Working", "Active"].includes(user.status)) return false;
    }
    if (roleFilter && String(user.role_id ?? "") !== String(roleFilter)) {
      return false;
    }
    if (normalizedQuery) {
      const haystack = [
        user.full_name,
        user.email,
        user.role_name,
        user.role_code,
        user.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(normalizedQuery)) {
        return false;
      }
    }
    return true;
  });

  const handleCreateUser = async () => {
    setCreateResult("");
    const requiredKey = newUser.person_id || newUser.person_code || newUser.email;
    if (!requiredKey) {
      setCreateResult("Add person ID, person code, or email.");
      return;
    }
    if (!newUser.first_name && !newUser.full_name && !newUser.display_name) {
      setCreateResult("Add at least a first name or full name.");
      return;
    }
    setCreating(true);
    const fullName = newUser.full_name || `${newUser.first_name} ${newUser.last_name}`.trim();
    const displayName = newUser.display_name || fullName;
    const payload = {
      person_id: newUser.person_id || undefined,
      person_code: newUser.person_code || undefined,
      personal_id: newUser.personal_id || undefined,
      email: newUser.email || undefined,
      first_name: newUser.first_name || undefined,
      last_name: newUser.last_name || undefined,
      role_id: newUser.role_id ? Number(newUser.role_id) : undefined,
      status: newUser.status || undefined,
      mobile_number: newUser.mobile_number || undefined,
      grade_id: newUser.grade_id ? Number(newUser.grade_id) : undefined,
      department_id: newUser.department_id ? Number(newUser.department_id) : undefined,
      manager_id: newUser.manager_id || undefined,
      employment_type: newUser.employment_type || undefined,
      join_date: newUser.join_date || undefined,
      exit_date: newUser.exit_date || undefined,
      source_system: newUser.source_system || undefined,
      full_name: fullName || undefined,
      display_name: displayName || undefined,
    };

    try {
      await apiFetch<PlatformUser>("/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setNewUser(defaultNewUser);
      setCreateResult("User added successfully.");
      loadUsers();
    } catch (error) {
      setCreateResult("Unable to add user. Check required fields.");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="text-steel">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-steel">User control center</p>
              <h2 className="text-lg font-semibold">Directory filters, bulk actions & users</h2>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1">Total {stats.total}</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">Active {stats.active}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Relieved {stats.relieved}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              className="min-w-[220px] flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm"
              placeholder="Search name, email, role..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                if (event.target.value) setShowRelievedOnly(false);
              }}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(event) => {
                  setActiveOnly(event.target.checked);
                  if (event.target.checked) setShowRelievedOnly(false);
                }}
              />
              Active only
            </label>
            <select
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="">All roles</option>
              {roles.map((role) => (
                <option key={role.role_id} value={role.role_id}>
                  {role.role_name || role.role_code || `Role ${role.role_id}`}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={showRelievedOnly}
                onChange={(event) => {
                  setShowRelievedOnly(event.target.checked);
                  if (event.target.checked) {
                    setActiveOnly(false);
                    setStatusFilter("");
                  }
                }}
              />
              Show relieved only
            </label>
            <a
              href={`${basePath}/api/admin/users/export`}
              className="rounded-full border border-black/10 px-3 py-1 text-xs text-slate-700"
            >
              Export full directory
            </a>
          </div>

          <div className="mt-5 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 text-xs uppercase text-steel">
            Directory users
          </div>
          <div className="mt-3 grid grid-cols-6 text-xs uppercase text-steel px-2">
            <div className="col-span-2">User</div>
            <div>Role</div>
            <div>Status</div>
            <div className="col-span-2">Actions</div>
          </div>
          <div className="mt-2 space-y-2">
            {displayUsers.map((user) => {
              const statusOptions = Array.from(
                new Set(["Working", "Active", "Inactive", user.status || ""])
              ).filter(Boolean);
              const roleOptions = [...roles];
              if (user.role_id && !roleOptions.some((role) => role.role_id === user.role_id)) {
                roleOptions.push({
                  role_id: user.role_id,
                  role_code: user.role_code || undefined,
                  role_name: user.role_name || undefined,
                });
              }
              return (
                <div
                  key={user.person_id}
                  className="grid grid-cols-6 items-center gap-2 rounded-2xl border border-black/5 bg-white/80 px-4 py-3"
                >
                  <div className="col-span-2">
                    <div className="font-semibold">{user.full_name || user.email}</div>
                    <div className="text-xs text-steel">{user.email}</div>
                  </div>
                  <div>
                    <select
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                      value={user.role_id ?? ""}
                      onChange={(event) => requestChange(user.person_id, { roleId: Number(event.target.value) })}
                    >
                      <option value="" disabled>
                        Select role
                      </option>
                      {roleOptions.map((role) => (
                        <option key={role.role_id} value={role.role_id}>
                          {role.role_name || role.role_code || `Role ${role.role_id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <select
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                      value={user.status || "Working"}
                      onChange={(event) => requestChange(user.person_id, { status: event.target.value })}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 text-xs text-steel">
                    Role changes and deactivations are audit logged.
                  </div>
                </div>
              );
            })}
            {!displayUsers.length && (
              <div className="section-card text-steel">No users match the current filters.</div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.2em] text-steel">Add user</p>
          <h2 className="text-lg font-semibold">Create access profile</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-steel">
            <a
              href={`${basePath}/templates/users_import_sample.csv`}
              className="rounded-full border border-black/10 px-3 py-1 text-slate-700"
            >
              Download sample CSV
            </a>
            <label className="rounded-full border border-black/10 px-3 py-1 text-slate-700">
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(event) => setImportFile(event.target.files?.[0] || null)}
              />
              {importFile ? "File selected" : "Choose CSV"}
            </label>
            <button
              className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              onClick={async () => {
                if (!importFile) return;
                setImportResult("Uploading...");
                const formData = new FormData();
                formData.append("file", importFile);
                const res = await fetch(`${basePath}/api/admin/users/import`, {
                  method: "POST",
                  body: formData,
                  credentials: "include",
                });
                const data = await res.json();
                if (!res.ok) {
                  setImportResult(data?.detail || "Import failed");
                  return;
                }
                setImportResult(
                  `Inserted ${data.inserted}, updated ${data.updated}, skipped ${data.skipped}, errors ${data.errors.length}`
                );
                setImportFile(null);
                loadUsers();
              }}
              disabled={!importFile}
            >
              Import CSV
            </button>
          </div>
          {importResult && <div className="mt-2 text-xs text-steel">{importResult}</div>}
          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                placeholder="Person ID"
                value={newUser.person_id}
                onChange={(event) => setNewUser({ ...newUser, person_id: event.target.value })}
              />
              <input
                className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                placeholder="Person code"
                value={newUser.person_code}
                onChange={(event) => setNewUser({ ...newUser, person_code: event.target.value })}
              />
            </div>
            <input
              className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              placeholder="Work email"
              value={newUser.email}
              onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                placeholder="First name"
                value={newUser.first_name}
                onChange={(event) => setNewUser({ ...newUser, first_name: event.target.value })}
              />
              <input
                className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                placeholder="Last name"
                value={newUser.last_name}
                onChange={(event) => setNewUser({ ...newUser, last_name: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                value={newUser.role_id}
                onChange={(event) => setNewUser({ ...newUser, role_id: event.target.value })}
              >
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.role_id} value={role.role_id}>
                    {role.role_name || role.role_code || `Role ${role.role_id}`}
                  </option>
                ))}
              </select>
              <select
                className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                value={newUser.status}
                onChange={(event) => setNewUser({ ...newUser, status: event.target.value })}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <details className="rounded-2xl border border-dashed border-black/10 bg-white/60 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-steel">
                Advanced fields
              </summary>
              <div className="mt-3 grid gap-3">
                <input
                  className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  placeholder="Mobile number"
                  value={newUser.mobile_number}
                  onChange={(event) => setNewUser({ ...newUser, mobile_number: event.target.value })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                    placeholder="Grade ID"
                    value={newUser.grade_id}
                    onChange={(event) => setNewUser({ ...newUser, grade_id: event.target.value })}
                  />
                  <input
                    className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                    placeholder="Department ID"
                    value={newUser.department_id}
                    onChange={(event) => setNewUser({ ...newUser, department_id: event.target.value })}
                  />
                </div>
                <input
                  className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  placeholder="Manager ID"
                  value={newUser.manager_id}
                  onChange={(event) => setNewUser({ ...newUser, manager_id: event.target.value })}
                />
                <input
                  className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  placeholder="Employment type"
                  value={newUser.employment_type}
                  onChange={(event) => setNewUser({ ...newUser, employment_type: event.target.value })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                    value={newUser.join_date}
                    onChange={(event) => setNewUser({ ...newUser, join_date: event.target.value })}
                  />
                  <input
                    type="date"
                    className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                    value={newUser.exit_date}
                    onChange={(event) => setNewUser({ ...newUser, exit_date: event.target.value })}
                  />
                </div>
                <input
                  className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  placeholder="Personal ID"
                  value={newUser.personal_id}
                  onChange={(event) => setNewUser({ ...newUser, personal_id: event.target.value })}
                />
                <input
                  className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  placeholder="Source system"
                  value={newUser.source_system}
                  onChange={(event) => setNewUser({ ...newUser, source_system: event.target.value })}
                />
                <input
                  className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  placeholder="Full name"
                  value={newUser.full_name}
                  onChange={(event) => setNewUser({ ...newUser, full_name: event.target.value })}
                />
                <input
                  className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  placeholder="Display name"
                  value={newUser.display_name}
                  onChange={(event) => setNewUser({ ...newUser, display_name: event.target.value })}
                />
              </div>
            </details>
          </div>
          <button
            className="mt-4 w-full rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={handleCreateUser}
            disabled={creating}
          >
            {creating ? "Saving..." : "Add user"}
          </button>
          {createResult && <div className="mt-2 text-xs text-steel">{createResult}</div>}
        </div>
      </div>
      {confirm && (
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(open) => !open && setConfirm(null)}
          title="Confirm change"
          description="This action is audited and may affect access immediately."
          onConfirm={applyChange}
          confirmLabel="Apply"
        />
      )}
    </div>
  );
}
