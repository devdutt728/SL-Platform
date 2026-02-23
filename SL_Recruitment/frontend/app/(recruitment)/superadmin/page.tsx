import { notFound } from "next/navigation";
import Link from "next/link";
import { SuperAdminRolesClient } from "./SuperAdminRolesClient";
import { SuperAdminPeopleClient } from "./SuperAdminPeopleClient";
import { getAuthMe } from "@/lib/auth-me";

type Me = {
  platform_role_id?: number | string | null;
  platform_role_code?: string | null;
};

export default async function SuperAdminPage() {
  const me = (await getAuthMe()) as Me | null;
  const roleIdRaw = me?.platform_role_id ?? null;
  const roleId = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
  const isSuperadmin = roleId === 2 || (me?.platform_role_code ?? "").trim() === "2";

  if (!isSuperadmin) {
    notFound();
  }

  return (
    <>
      <div className="content-pad">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">SuperAdmin tools</p>
            <p className="text-sm text-slate-600">Manage sprint templates and system-wide setup.</p>
          </div>
          <Link
            href="/sprint-templates"
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-card hover:bg-slate-800"
          >
            Open Sprint Templates
          </Link>
        </div>
      </div>
      <SuperAdminRolesClient />
      <div className="content-pad mt-8">
        <SuperAdminPeopleClient />
      </div>
    </>
  );
}


