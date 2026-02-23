import ReportsClient from "./ReportsClient";
import { getAuthMe } from "@/lib/auth-me";

export default async function ReportsPage() {
  const me = await getAuthMe();
  const roleIdRaw = me?.platform_role_id ?? null;
  const roleId = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
  const roleIdsRaw = (me?.platform_role_ids || []) as Array<number | string>;
  const roleIds = roleIdsRaw
    .map((id) => (typeof id === "number" ? id : Number(id)))
    .filter((id) => Number.isFinite(id));
  const roleCodes = (me?.platform_role_codes || []).map((code) => String(code || "").trim());
  const roles = (me?.roles || []).map((role) => String(role || "").toLowerCase());
  const canAccess =
    roleId === 2 ||
    roleIds.includes(2) ||
    roleCodes.includes("2") ||
    roles.includes("hr_admin");

  return <ReportsClient canAccess={canAccess} />;
}
