import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { SprintTemplate } from "@/lib/types";
import { SprintTemplatesClient } from "./SprintTemplatesClient";
import { getAuthMe } from "@/lib/auth-me";

async function fetchTemplates() {
  const res = await fetch(backendUrl("/rec/sprint-templates?include_inactive=1"), {
    cache: "no-store",
    headers: { ...await authHeaderFromCookie() },
  });
  if (!res.ok) return [];
  return (await res.json()) as SprintTemplate[];
}

export default async function SprintTemplatesPage() {
  const [templates, me] = await Promise.all([fetchTemplates(), getAuthMe()]);
  const roleIdRaw = me?.platform_role_id ?? null;
  const roleId = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
  const roleIdsRaw = (me?.platform_role_ids || []) as Array<number | string>;
  const roleIds = roleIdsRaw
    .map((id) => (typeof id === "number" ? id : Number(id)))
    .filter((id) => Number.isFinite(id));
  const roleCodes = (me?.platform_role_codes || []).map((code) => String(code || "").trim().toLowerCase());
  const roleNames = (me?.platform_role_names || []).map((name) => String(name || "").trim().toLowerCase());
  const roles = (me?.roles || []).map((role) => String(role || "").trim().toLowerCase());
  const isSuperadmin =
    roleId === 2 ||
    roleIds.includes(2) ||
    roleCodes.includes("2") ||
    roleCodes.includes("superadmin") ||
    roleCodes.includes("s_admin") ||
    roleCodes.includes("super_admin") ||
    roleNames.some((name) => name.replace(/\s+/g, "") === "superadmin") ||
    roles.includes("hr_admin");

  return <SprintTemplatesClient initialTemplates={templates} initialIsSuperadmin={isSuperadmin} />;
}
