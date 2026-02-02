import { cookieHeader } from "@/lib/cookie-header";
import { internalUrl } from "@/lib/internal";
import { notFound } from "next/navigation";
import { SuperAdminRolesClient } from "./SuperAdminRolesClient";
import { SuperAdminPeopleClient } from "./SuperAdminPeopleClient";

type Me = {
  platform_role_id?: number | null;
  platform_role_code?: string | null;
};

export default async function SuperAdminPage() {
  const cookieValue = await cookieHeader();
  const meRes = await fetch(await internalUrl("/api/auth/me"), {
    cache: "no-store",
    headers: cookieValue ? { cookie: cookieValue } : undefined,
  });
  const me = (meRes.ok ? ((await meRes.json()) as Me) : null) || null;
  const isSuperadmin = (me?.platform_role_id ?? null) === 2 || (me?.platform_role_code ?? "").trim() === "2";

  if (!isSuperadmin) {
    notFound();
  }

  return (
    <>
      <SuperAdminRolesClient />
      <div className="content-pad mt-8">
        <SuperAdminPeopleClient />
      </div>
    </>
  );
}


