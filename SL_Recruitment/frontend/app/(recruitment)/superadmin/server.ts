import { notFound } from "next/navigation";
import { getAuthMe } from "@/lib/auth-me";
import { internalUrl } from "@/lib/internal";
import { cookieHeader } from "@/lib/cookie-header";
import type { OpeningListItem } from "@/lib/types";

type Me = {
  platform_role_id?: number | string | null;
  platform_role_code?: string | null;
};

function isSuperadmin(me: Me | null) {
  const roleIdRaw = me?.platform_role_id ?? null;
  const roleId = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
  return roleId === 2 || (me?.platform_role_code ?? "").trim() === "2";
}

export async function requireSuperadminAccess() {
  const me = (await getAuthMe()) as Me | null;
  if (!isSuperadmin(me)) notFound();
}

export async function fetchOpeningsForSuperadmin() {
  const url = await internalUrl("/api/rec/openings");
  const cookieValue = await cookieHeader();
  const res = await fetch(url, { cache: "no-store", headers: cookieValue ? { cookie: cookieValue } : undefined });
  if (!res.ok) return [] as OpeningListItem[];
  try {
    return (await res.json()) as OpeningListItem[];
  } catch {
    return [] as OpeningListItem[];
  }
}
