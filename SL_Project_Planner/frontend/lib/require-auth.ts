import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPlannerAuthMe } from "@/lib/auth-me";

async function employeeRedirectTarget() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const proto = headerStore.get("x-forwarded-proto") || "http";
  if (!host) return "/employee";
  return `${proto}://${host}/employee`;
}

export async function requirePlannerAccess() {
  const authMode =
    process.env.NEXT_PUBLIC_PLANNER_AUTH_MODE ||
    process.env.NEXT_PUBLIC_AUTH_MODE ||
    "dev";
  if (authMode !== "google") return null;

  const auth = await getPlannerAuthMe();
  if (auth.status >= 500) {
    throw new Error(auth.detail || "Planner auth is failing");
  }
  if (!auth.me?.can_access_planner) redirect(await employeeRedirectTarget());
  return auth.me;
}
