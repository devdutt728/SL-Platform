import { notFound } from "next/navigation";
import Link from "next/link";
import { IngestOpsPanel } from "./features/ingest-ops/IngestOpsPanel";
import { PeoplePanel } from "./features/people/PeoplePanel";
import { RolesPanel } from "./features/roles/RolesPanel";
import { getAuthMe } from "@/lib/auth-me";
import { internalUrl } from "@/lib/internal";
import { cookieHeader } from "@/lib/cookie-header";
import type { OpeningListItem } from "@/lib/types";

type Me = {
  platform_role_id?: number | string | null;
  platform_role_code?: string | null;
};

async function fetchOpenings() {
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

export default async function SuperAdminPage() {
  const me = (await getAuthMe()) as Me | null;
  const roleIdRaw = me?.platform_role_id ?? null;
  const roleId = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
  const isSuperadmin = roleId === 2 || (me?.platform_role_code ?? "").trim() === "2";

  if (!isSuperadmin) {
    notFound();
  }
  const openings = await fetchOpenings();

  return (
    <>
      <div className="content-pad">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">SuperAdmin tools</p>
            <p className="text-sm text-slate-600">Choose a function and run each workflow with dedicated controls.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="#ingest-ops" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Ingest Operations
            </Link>
            <Link href="#role-management" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Role Management
            </Link>
            <Link href="#people-management" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              People Management
            </Link>
            <Link
              href="/sprint-templates"
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-card hover:bg-slate-800"
            >
              Open Sprint Templates
            </Link>
          </div>
        </div>
      </div>
      <section id="ingest-ops" className="scroll-mt-24">
        <IngestOpsPanel openings={openings.map((item) => ({ opening_id: item.opening_id, title: item.title, opening_code: item.opening_code }))} />
      </section>
      <section id="role-management" className="scroll-mt-24">
        <RolesPanel />
      </section>
      <section id="people-management" className="content-pad mt-8 scroll-mt-24">
        <PeoplePanel />
      </section>
    </>
  );
}


