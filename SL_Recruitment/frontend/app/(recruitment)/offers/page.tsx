import { OffersClient } from "./OffersClient";
import { getAuthMe } from "@/lib/auth-me";
import { notFound } from "next/navigation";

type Me = {
  platform_role_id?: number | string | null;
  platform_role_ids?: Array<number | string> | null;
  platform_role_code?: string | null;
  platform_role_codes?: string[] | null;
  platform_role_name?: string | null;
  platform_role_names?: string[] | null;
  roles?: string[] | null;
};

function normalizeRole(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isHrRole(value: string) {
  if (!value) return false;
  const compact = value.replace(/_/g, "");
  if (value === "hr" || value.startsWith("hr_") || value.startsWith("hr")) return true;
  return compact.includes("humanresource");
}

export default async function OffersPage() {
  const me = (await getAuthMe()) as Me | null;
  const roleIdRaw = me?.platform_role_id ?? null;
  const parsedRoleId =
    roleIdRaw === null || roleIdRaw === undefined || String(roleIdRaw).trim() === ""
      ? NaN
      : typeof roleIdRaw === "number"
        ? roleIdRaw
        : Number(roleIdRaw);
  const roleId = Number.isFinite(parsedRoleId) ? parsedRoleId : null;
  const roleIds = [
    roleId,
    ...((me?.platform_role_ids || []).map((id) => {
      if (id === null || id === undefined || String(id).trim() === "") return NaN;
      return typeof id === "number" ? id : Number(id);
    })),
  ].filter((id): id is number => Number.isFinite(id));
  const normalizedRoles = [
    ...(me?.roles || []),
    ...(me?.platform_role_codes || []),
    ...(me?.platform_role_names || []),
    me?.platform_role_code || "",
    me?.platform_role_name || "",
  ]
    .map((role) => normalizeRole(role))
    .filter(Boolean);

  const isSuperadmin =
    roleIds.includes(2) || normalizedRoles.some((role) => ["2", "superadmin", "s_admin", "super_admin"].includes(role));
  const isHr = isSuperadmin || normalizedRoles.some((role) => isHrRole(role));
  if (!isHr) notFound();

  return <OffersClient />;
}
