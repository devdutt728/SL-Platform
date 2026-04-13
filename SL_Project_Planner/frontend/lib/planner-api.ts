import { cookies, headers } from "next/headers";

export function plannerBackendUrl(path: string) {
  const base = process.env.BACKEND_URL || "http://127.0.0.1:8003";
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

export async function plannerAuthHeaders() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const authHeaders: Record<string, string> = {};
  const plannerToken = cookieStore.get("spp_token")?.value;
  const sharedToken = cookieStore.get("slp_token")?.value;
  const plannerSession = cookieStore.get("spp_sid")?.value;
  const sharedSession = cookieStore.get("slp_sid")?.value;
  const hasSharedAuth = Boolean(sharedToken && sharedSession);
  const hasPlannerAuth = Boolean(plannerToken && plannerSession);
  const sharedDiffers =
    hasSharedAuth &&
    (!hasPlannerAuth || plannerToken !== sharedToken || plannerSession !== sharedSession);
  const token = (hasSharedAuth ? sharedToken : plannerToken) || headerStore.get("authorization") || "";
  const session = (hasSharedAuth ? sharedSession : plannerSession) || "";

  if (token) {
    authHeaders.authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }
  if (session) {
    authHeaders["x-spp-session"] = session;
  }
  if (sharedDiffers) {
    authHeaders["x-spp-session-init"] = "1";
  }

  if (!authHeaders.authorization && process.env.PLANNER_DEV_EMAIL) {
    authHeaders["x-user-email"] = process.env.PLANNER_DEV_EMAIL;
    authHeaders["x-user-name"] = process.env.PLANNER_DEV_NAME || "Planner Demo";
    authHeaders["x-user-roles"] = process.env.PLANNER_DEV_ROLES || "viewer";
  }

  return authHeaders;
}
