import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthMe } from "@/lib/auth-me";
import { getPublicPortalRedirectTarget } from "@/lib/public-portal";

export async function requireAuth() {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || "dev";
  const publicPortalTarget = getPublicPortalRedirectTarget();
  if (authMode !== "google") return null;

  const cookieStore = await cookies();
  const token = cookieStore.get("slp_token")?.value;
  if (!token) redirect(publicPortalTarget);

  const me = await getAuthMe();
  if (!me) redirect(publicPortalTarget);
  return me;
}

export async function requireRecruitmentAccess() {
  const me = await requireAuth();
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || "dev";
  if (authMode !== "google" || !me) return me;
  if (!me.can_access_recruitment) redirect("/employee");
  return me;
}

