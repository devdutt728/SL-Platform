import { cache } from "react";
import { plannerAuthHeaders, plannerBackendUrl } from "@/lib/planner-api";

export type PlannerAuthMe = {
  email?: string;
  person_id_platform?: string | null;
  full_name?: string | null;
  roles?: string[] | null;
  platform_role_id?: number | string | null;
  platform_role_ids?: Array<number | string> | null;
  platform_role_code?: string | null;
  platform_role_codes?: string[] | null;
  platform_role_name?: string | null;
  platform_role_names?: string[] | null;
  can_access_recruitment?: boolean;
  can_access_planner?: boolean;
};

export type PlannerAuthResult = {
  me: PlannerAuthMe | null;
  status: number;
  detail?: string;
};

function extractDetail(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { detail?: string };
    return parsed.detail || raw;
  } catch {
    return raw;
  }
}

const loadPlannerAuthMe = cache(async (): Promise<PlannerAuthResult> => {
  try {
    const res = await fetch(plannerBackendUrl("/auth/me"), {
      cache: "no-store",
      headers: await plannerAuthHeaders(),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        me: null,
        status: res.status,
        detail: extractDetail(text) || "Planner auth request failed",
      };
    }
    return {
      me: (await res.json()) as PlannerAuthMe,
      status: res.status,
    };
  } catch {
    return {
      me: null,
      status: 503,
      detail: "Planner auth service is unavailable",
    };
  }
});

export async function getPlannerAuthMe(): Promise<PlannerAuthResult> {
  return loadPlannerAuthMe();
}
