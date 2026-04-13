import Link from "next/link";
import { cookies } from "next/headers";
import { PlannerLaunchClient } from "./PlannerLaunchClient";

export const dynamic = "force-dynamic";

type PlannerAuthResponse = {
  can_access_planner?: boolean;
  full_name?: string | null;
  detail?: string;
};

function plannerBackendUrl(path: string) {
  const base = process.env.PLANNER_BACKEND_URL || "http://127.0.0.1:8003";
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function checkPlannerAccess(): Promise<{
  ok: boolean;
  status: number;
  detail: string;
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get("slp_token")?.value || "";
  const sessionId = cookieStore.get("slp_sid")?.value || "";

  if (!token || !sessionId) {
    return {
      ok: false,
      status: 401,
      detail: "Your workbook session is missing. Sign in again and retry.",
    };
  }

  try {
    const response = await fetch(plannerBackendUrl("/auth/me"), {
      cache: "no-store",
      headers: {
        authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
        "x-spp-session": sessionId,
        "x-spp-session-init": "1",
      },
    });

    const text = await response.text();
    let payload: PlannerAuthResponse | null = null;
    try {
      payload = JSON.parse(text) as PlannerAuthResponse;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        detail: payload?.detail || text || "Planner sign-in check failed.",
      };
    }

    if (!payload?.can_access_planner) {
      return {
        ok: false,
        status: 403,
        detail: "Planner access is not enabled for this account.",
      };
    }

    return {
      ok: true,
      status: response.status,
      detail: "",
    };
  } catch {
    return {
      ok: false,
      status: 503,
      detail: "Planner service is unavailable right now.",
    };
  }
}

export default async function PlannerLaunchPage() {
  const result = await checkPlannerAccess();

  if (result.ok) {
    return (
      <main className="page-shell min-h-screen flex items-center justify-center pb-12 pt-24">
        <PlannerLaunchClient />
        <div className="section-card workbook-card w-full max-w-2xl">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-steel">Project Planner</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Opening Planner...</h1>
          <p className="mt-4 text-sm text-steel">
            Your workbook session is valid. Redirecting to the planner workspace now.
          </p>
          <div className="mt-6">
            <Link href="/planner" className="public-button public-button--primary">
              Continue
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell min-h-screen flex items-center justify-center pb-12 pt-24">
      <div className="section-card workbook-card w-full max-w-2xl">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-steel">Project Planner</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">Planner is not opening.</h1>
        <p className="mt-4 text-sm text-steel">{result.detail}</p>
        <p className="mt-3 text-xs text-steel">Status: {result.status}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/employee" className="public-button public-button--ghost">
            Back to Workbook
          </Link>
          <Link href="/planner" className="public-button public-button--primary">
            Try Planner Directly
          </Link>
        </div>
      </div>
    </main>
  );
}
