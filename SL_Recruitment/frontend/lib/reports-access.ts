type ReportsAccessActor = {
  platform_role_id?: number | string | null;
  platform_role_ids?: Array<number | string> | null;
  platform_role_code?: string | null;
  platform_role_codes?: string[] | null;
  platform_role_name?: string | null;
  platform_role_names?: string[] | null;
  can_access_recruitment?: boolean;
  can_access_planner?: boolean;
  reports_access?: boolean;
};

const SUPERADMIN_TOKENS = new Set(["2", "superadmin", "s_admin", "super_admin"]);

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
  return Boolean(actor?.reports_access);
}

export function canAccessRecruitment(actor: ReportsAccessActor | null | undefined): boolean {
  if (isSuperadmin(actor)) return true;
  return Boolean(actor?.can_access_recruitment);
}

export function canAccessPlanner(actor: ReportsAccessActor | null | undefined): boolean {
  if (isSuperadmin(actor)) return true;
  return Boolean(actor?.can_access_planner);
}

export type { ReportsAccessActor };
