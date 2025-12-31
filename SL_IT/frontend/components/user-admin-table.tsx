"use client";

import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiFetch } from "@/lib/api";
import type { PlatformRole, PlatformUser } from "@/lib/types";

export function UserAdminTable() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{
    userId: string;
    roleId?: number;
    status?: string;
  } | null>(null);

  const loadUsers = () => {
    setLoading(true);
    apiFetch<PlatformUser[]>("/admin/users")
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

  if (loading) {
    return <div className="text-steel">Loading users...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-6 text-xs uppercase text-steel px-4">
        <div className="col-span-2">User</div>
        <div>Role</div>
        <div>Status</div>
        <div className="col-span-2">Actions</div>
      </div>
      {users.map((user) => {
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
