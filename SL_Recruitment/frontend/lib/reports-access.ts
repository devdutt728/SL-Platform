type ReportsAccessActor = {
  platform_role_id?: number | string | null;
  platform_role_ids?: Array<number | string> | null;
  platform_role_code?: string | null;
  platform_role_codes?: string[] | null;
  platform_role_name?: string | null;
  platform_role_names?: string[] | null;
};

const SUPERADMIN_TOKENS = new Set(["2", "superadmin", "s_admin", "super_admin"]);
const REPORTS_ACCESS_TOKENS = new Set([
  "recruitment_reports",
  "recruitment_reports_access",
  "reports_access",
]);

function normalizeRoleToken(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function toRoleIds(values: Array<number | string | null | undefined>): number[] {
  return values
    .map((value) => {
      if (value === null || value === undefined || String(value).trim() === "") return NaN;
      return typeof value === "number" ? value : Number(value);
    })
    .filter((value): value is number => Number.isFinite(value));
}

function getRoleTokens(actor: ReportsAccessActor | null | undefined): Set<string> {
  return new Set(
    [
      ...(actor?.platform_role_codes || []),
      ...(actor?.platform_role_names || []),
      actor?.platform_role_code || "",
      actor?.platform_role_name || "",
    ]
      .map((value) => normalizeRoleToken(value))
      .filter(Boolean)
  );
}

export function isSuperadmin(actor: ReportsAccessActor | null | undefined): boolean {
  const roleIds = toRoleIds([actor?.platform_role_id ?? null, ...((actor?.platform_role_ids || []) as Array<number | string>)]);
  if (roleIds.includes(2)) return true;
  const tokens = getRoleTokens(actor);
  return Array.from(tokens).some((token) => SUPERADMIN_TOKENS.has(token));
}

export function canAccessReports(actor: ReportsAccessActor | null | undefined): boolean {
  if (isSuperadmin(actor)) return true;
  const tokens = getRoleTokens(actor);
  return Array.from(tokens).some((token) => REPORTS_ACCESS_TOKENS.has(token));
}

export type { ReportsAccessActor };
