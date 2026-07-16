"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { API_BASE, apiFetch } from "@/lib/api";
import type { PlatformRole, PlatformUser } from "@/lib/types";

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const IMS_ROLE_CODES = new Set(["ims_admin", "ims_manager", "ims_operator", "ims_viewer"]);
const IMS_ROLE_IDS = new Set([9, 10, 11, 18]);

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isActiveStatus(status?: string | null) {
  if (!status) return true;
  const normalized = status.trim().toLowerCase();
  return normalized === "working" || normalized === "active";
}

function isRelievedStatus(status?: string | null, isDeleted?: number | null) {
  if (isDeleted) return true;
  if (!status) return false;
  const normalized = status.trim().toLowerCase();
  return normalized === "relieved" || normalized === "inactive";
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

function roleLabel(role: PlatformRole) {
  return role.role_name || role.role_code || `Role ${role.role_id}`;
}

function isImsRole(role: PlatformRole) {
  const code = role.role_code?.trim().toLowerCase();
  return (code && IMS_ROLE_CODES.has(code)) || IMS_ROLE_IDS.has(role.role_id);
}

function sameNumberSet(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

export function UserAdminTable() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{
    userId: string;
    roleIds?: number[];
    status?: string;
  } | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [activeOnly, setActiveOnly] = useState(true);
  const [relievedOnly, setRelievedOnly] = useState(false);
  const [pendingRoleIds, setPendingRoleIds] = useState<Record<string, number[]>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    person_id: "",
    person_code: "",
    email: "",
    first_name: "",
    last_name: "",
    role_ids: [] as string[],
    status: "Working",
  });

  const loadUsers = (query?: string) => {
    setLoading(true);
    const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
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
    const handle = setTimeout(() => {
      loadUsers(search.trim() || undefined);
    }, 350);
    return () => clearTimeout(handle);
  }, [search]);

  const requestChange = (userId: string, updates: { roleIds?: number[]; status?: string }) => {
    setActionError(null);
    setConfirm({ userId, ...updates });
  };

  const applyChange = async () => {
    if (!confirm) return;
    try {
      await apiFetch(`/admin/users/${confirm.userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role_ids: confirm.roleIds, status: confirm.status }),
      });
      setPendingRoleIds((prev) => {
        const next = { ...prev };
        delete next[confirm.userId];
        return next;
      });
      setConfirm(null);
      loadUsers(search.trim() || undefined);
    } catch (e: any) {
      setConfirm(null);
      setActionError(e?.message || "Failed to apply change.");
    }
  };

  const saveRoles = async (userId: string, roleIds: number[]) => {
    if (!roleIds.length) return;
    setSavingUserId(userId);
    setActionError(null);
    try {
      await apiFetch(`/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role_ids: roleIds }),
      });
      setPendingRoleIds((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      loadUsers(search.trim() || undefined);
    } catch (e: any) {
      setActionError(e?.message || "Failed to save roles.");
    } finally {
      setSavingUserId(null);
    }
  };

  const statusOptions = useMemo(() => {
    const options = new Set<string>();
    users.forEach((user) => {
      if (user.status) options.add(user.status);
    });
    return ["ALL", ...Array.from(options).sort()];
  }, [users]);

  const roleOptions = useMemo(() => {
    const options = roles.filter(isImsRole);
    users.forEach((user) => {
      (user.role_ids || (user.role_id ? [user.role_id] : [])).forEach((roleId) => {
        if (roleId && IMS_ROLE_IDS.has(roleId) && !options.some((role) => role.role_id === roleId)) {
          options.push({
            role_id: roleId,
            role_code: undefined,
            role_name: undefined,
          });
        }
      });
    });
    return options;
  }, [roles, users]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      if (term) {
        const roleText = (user.role_names && user.role_names.length
          ? user.role_names.join(" ")
          : user.role_name || user.role_code || ""
        ).toLowerCase();
        const haystack = `${user.full_name || ""} ${user.email || ""} ${roleText}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter !== "ALL" && (user.status || "") !== statusFilter) return false;
      if (roleFilter !== "ALL") {
        const roleIds = user.role_ids && user.role_ids.length ? user.role_ids : user.role_id ? [user.role_id] : [];
        if (!roleIds.some((roleId) => String(roleId) === roleFilter)) return false;
      }
      if (activeOnly && !isActiveStatus(user.status)) return false;
      if (relievedOnly && !isRelievedStatus(user.status, user.is_deleted)) return false;
      if (activeOnly && relievedOnly) return false;
      return true;
    });
  }, [users, search, statusFilter, roleFilter, activeOnly, relievedOnly]);

  const activeCount = useMemo(() => users.filter((user) => isActiveStatus(user.status)).length, [users]);
  const relievedCount = useMemo(
    () => users.filter((user) => isRelievedStatus(user.status, user.is_deleted)).length,
    [users]
  );

  const exportDirectory = () => {
    const rows = filteredUsers.map((user) => [
      user.person_id,
      user.full_name || "",
      user.email || "",
      user.role_names && user.role_names.length
        ? user.role_names.join("; ")
        : user.role_name || user.role_code || "",
      user.status || "",
    ]);
    const content = [
      "person_id,full_name,email,role,status",
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/\"/g, "\"\"")}"`).join(",")),
    ].join("\n");
    downloadText("user-directory.csv", content);
  };

  const downloadSampleCsv = () => {
    downloadText(
      "user-directory-sample.csv",
      [
        "person_id,person_code,email,first_name,last_name,role_ids,status",
        "EMP-001,SL-EMP-001,alex@studiolotus.in,Alex,Ray,2,Working",
      ].join("\n")
    );
  };

  const importUsers = async () => {
    if (!importFile) return;
    const validation = validateCsvFile(importFile);
    if (validation) {
      setImportError(validation);
      return;
    }
    setImportBusy(true);
    setImportError(null);
    setImportMessage(null);
    try {
      const formData = new FormData();
      formData.append("upload", importFile);
      const res = await fetch(`${API_BASE}/admin/users/import`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setImportMessage(`Imported ${result.created || 0} users. Skipped ${result.skipped || 0}.`);
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = "";
      loadUsers(search.trim() || undefined);
    } catch (e: any) {
      setImportError(e?.message || "CSV import failed");
    } finally {
      setImportBusy(false);
    }
  };

  const createUser = async () => {
    const payload = {
      person_id: newUser.person_id.trim(),
      person_code: newUser.person_code.trim(),
      email: newUser.email.trim() || null,
      first_name: newUser.first_name.trim(),
      last_name: newUser.last_name.trim() || null,
      role_ids: newUser.role_ids.length ? newUser.role_ids.map((value) => Number(value)) : [],
      status: newUser.status.trim() || null,
    };
    if (!payload.person_id || !payload.person_code || !payload.first_name || payload.role_ids.length === 0) {
      setCreateError("Person ID, person code, first name, and at least one role are required.");
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    setCreateMessage(null);
    try {
      await apiFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreateMessage("User created successfully.");
      setNewUser({
        person_id: "",
        person_code: "",
        email: "",
        first_name: "",
        last_name: "",
        role_ids: [],
        status: "Working",
      });
      loadUsers(search.trim() || undefined);
    } catch (e: any) {
      setCreateError(e?.message || "Failed to create user");
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="section-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.4em] text-steel">
              User control center
            </p>
            <h2 className="mt-2 text-lg font-semibold">Directory filters and access</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1">
              Total {users.length}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-100/70 px-3 py-1 text-emerald-700">
              Active {activeCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1">
              Relieved {relievedCount}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 2xl:grid-cols-[minmax(260px,1fr)_160px_180px_auto_auto]">
          <input
            className="h-10 w-full rounded-xl border border-black/10 bg-white px-4 text-sm shadow-sm outline-none focus:border-brand/50"
            placeholder="Search name, email, role..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm shadow-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === "ALL" ? "All statuses" : status}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm shadow-sm"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="ALL">All roles</option>
            {roleOptions.map((role) => (
              <option key={role.role_id} value={String(role.role_id)}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
          <label className="flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => {
                setActiveOnly(event.target.checked);
                if (event.target.checked) setRelievedOnly(false);
              }}
            />
            Active only
          </label>
          <label className="flex h-10 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={relievedOnly}
              onChange={(event) => {
                setRelievedOnly(event.target.checked);
                if (event.target.checked) setActiveOnly(false);
              }}
            />
            Show relieved only
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={exportDirectory}
            className="h-9 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold shadow-sm"
          >
            Export shown users
          </button>
          <p className="text-xs text-steel">Showing {filteredUsers.length} of {users.length} users</p>
        </div>

        {actionError ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {actionError}
          </div>
        ) : null}

        <div className="mt-6 hidden grid-cols-[minmax(220px,1.25fr)_minmax(320px,2fr)_150px_150px] gap-4 px-4 text-xs font-semibold uppercase tracking-wide text-steel lg:grid">
          <div>User</div>
          <div>Roles</div>
          <div>Status</div>
          <div>Action</div>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-steel">Loading users...</div>
        ) : null}

        {!loading && filteredUsers.map((user) => {
          const statusList = Array.from(new Set(["Working", "Active", "Inactive", "Relieved", user.status || ""])).filter(Boolean);
          const availableRoles = [...roleOptions];
          const selectedRoleIds = (
            user.role_ids && user.role_ids.length ? user.role_ids : user.role_id ? [user.role_id] : []
          ).filter((roleId) => IMS_ROLE_IDS.has(roleId));
          const draftRoleIds = pendingRoleIds[user.person_id] || selectedRoleIds;
          const roleDirty = !sameNumberSet(draftRoleIds, selectedRoleIds);
          selectedRoleIds.forEach((roleId) => {
            if (roleId && !availableRoles.some((role) => role.role_id === roleId)) {
              availableRoles.push({
                role_id: roleId,
                role_code: user.role_code || undefined,
                role_name: user.role_name || undefined,
              });
            }
          });
          return (
            <div
              key={user.person_id}
              className="mt-2 grid gap-4 rounded-xl border border-black/5 bg-white px-4 py-4 shadow-sm lg:grid-cols-[minmax(220px,1.25fr)_minmax(320px,2fr)_150px_150px] lg:items-center"
            >
              <div>
                <div className="font-semibold">{user.full_name || user.email}</div>
                <div className="text-xs text-steel">{user.email || "—"}</div>
              </div>
              <div>
                <div className="flex max-h-24 flex-wrap gap-2 overflow-auto pr-1">
                  {availableRoles.map((role) => {
                    const selected = draftRoleIds.includes(role.role_id);
                    return (
                      <button
                        key={role.role_id}
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          setPendingRoleIds((prev) => {
                            const current = prev[user.person_id] || selectedRoleIds;
                            const nextRoleIds = selected
                              ? current.filter((roleId) => roleId !== role.role_id)
                              : [...current, role.role_id];
                            return { ...prev, [user.person_id]: Array.from(new Set(nextRoleIds)) };
                          });
                        }}
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-semibold transition",
                          selected
                            ? "border-brand/30 bg-brand/10 text-brand"
                            : "border-black/10 bg-slate-50 text-slate-600 hover:border-brand/30",
                        ].join(" ")}
                      >
                        {roleLabel(role)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <select
                  className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm shadow-sm"
                  value={user.status || "Working"}
                  onChange={(event) => requestChange(user.person_id, { status: event.target.value })}
                >
                  {statusList.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-2">
                {roleDirty ? (
                  <button
                    type="button"
                    disabled={draftRoleIds.length === 0 || savingUserId === user.person_id}
                    onClick={() => void saveRoles(user.person_id, draftRoleIds)}
                    className="h-9 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingUserId === user.person_id ? "Saving..." : "Save roles"}
                  </button>
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Saved</span>
                )}
              </div>
            </div>
          );
        })}

        {!loading && !filteredUsers.length && (
          <div className="mt-4 text-sm text-steel">No users match the current filters.</div>
        )}
      </section>

      <section className="section-card space-y-4 xl:sticky xl:top-4 xl:self-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-steel">Add user</p>
          <h3 className="mt-2 text-lg font-semibold">Create access profile</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-semibold shadow-sm"
            onClick={downloadSampleCsv}
          >
            Download sample CSV
          </button>
          <label className="cursor-pointer rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-semibold shadow-sm">
            Choose CSV
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setImportError(null);
                setImportMessage(null);
                setImportFile(file);
              }}
            />
          </label>
          <button
            type="button"
            disabled={importBusy || !importFile}
            onClick={() => void importUsers()}
            className="rounded-xl border border-black/10 bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Import CSV
          </button>
        </div>

        {importError ? <div className="text-xs text-rose-600">{importError}</div> : null}
        {importMessage ? <div className="text-xs text-emerald-600">{importMessage}</div> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded-xl border border-black/10 bg-white/70 px-4 py-2 text-sm"
            placeholder="Person ID"
            value={newUser.person_id}
            onChange={(event) => setNewUser((prev) => ({ ...prev, person_id: event.target.value }))}
          />
          <input
            className="rounded-xl border border-black/10 bg-white/70 px-4 py-2 text-sm"
            placeholder="Person code"
            value={newUser.person_code}
            onChange={(event) => setNewUser((prev) => ({ ...prev, person_code: event.target.value }))}
          />
          <input
            className="rounded-xl border border-black/10 bg-white/70 px-4 py-2 text-sm md:col-span-2"
            placeholder="Work email"
            value={newUser.email}
            onChange={(event) => setNewUser((prev) => ({ ...prev, email: event.target.value }))}
          />
          <input
            className="rounded-xl border border-black/10 bg-white/70 px-4 py-2 text-sm"
            placeholder="First name"
            value={newUser.first_name}
            onChange={(event) => setNewUser((prev) => ({ ...prev, first_name: event.target.value }))}
          />
          <input
            className="rounded-xl border border-black/10 bg-white/70 px-4 py-2 text-sm"
            placeholder="Last name"
            value={newUser.last_name}
            onChange={(event) => setNewUser((prev) => ({ ...prev, last_name: event.target.value }))}
          />
          <select
            className="min-h-28 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm"
            multiple
            value={newUser.role_ids}
            onChange={(event) =>
              setNewUser((prev) => ({
                ...prev,
                role_ids: Array.from(event.target.selectedOptions).map((option) => option.value),
              }))
            }
          >
            {roleOptions.map((role) => (
              <option key={role.role_id} value={role.role_id}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-black/10 bg-white/70 px-4 py-2 text-sm"
            value={newUser.status}
            onChange={(event) => setNewUser((prev) => ({ ...prev, status: event.target.value }))}
          >
            {["Working", "Active", "Inactive", "Relieved"].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {createError ? <div className="text-xs text-rose-600">{createError}</div> : null}
        {createMessage ? <div className="text-xs text-emerald-600">{createMessage}</div> : null}

        <button
          type="button"
          disabled={createBusy}
          onClick={() => void createUser()}
          className="w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add user
        </button>
      </section>

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

