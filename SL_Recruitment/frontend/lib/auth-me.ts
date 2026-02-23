import { cache } from "react";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { backendUrl } from "@/lib/backend";

export type AuthMe = {
  email?: string;
  full_name?: string | null;
  roles?: string[] | null;
  platform_role_id?: number | string | null;
  platform_role_ids?: Array<number | string> | null;
  platform_role_code?: string | null;
  platform_role_codes?: string[] | null;
  platform_role_name?: string | null;
  platform_role_names?: string[] | null;
};

const loadAuthMe = cache(async (): Promise<AuthMe | null> => {
  const authHeaders = await authHeaderFromCookie();

  try {
    const res = await fetch(backendUrl("/auth/me"), {
      cache: "no-store",
      headers: authHeaders,
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthMe;
  } catch {
    return null;
  }
});

export async function getAuthMe(): Promise<AuthMe | null> {
  return loadAuthMe();
}
