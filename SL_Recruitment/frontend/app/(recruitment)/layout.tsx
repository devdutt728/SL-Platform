import { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { ContextPanel } from "@/components/context-panel";
import { requireAuth } from "@/lib/require-auth";

export default async function RecruitmentLayout({ children }: { children: ReactNode }) {
  const me = await requireAuth();
  let hideContextPanel = false;
  try {
    const roleIdRaw = me?.platform_role_id ?? null;
    const roleIdNum = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
    const roleIdsRaw = (me?.platform_role_ids || []) as Array<number | string>;
    const roleIds = roleIdsRaw
      .map((id) => (typeof id === "number" ? id : Number(id)))
      .filter((id) => Number.isFinite(id));
    const isRole6 =
      roleIdNum === 6 ||
      roleIds.includes(6) ||
      roleIdsRaw.map((id) => String(id).trim()).includes("6");
    if (isRole6) hideContextPanel = true;
  } catch {
    // ignore lookup errors
  }

  return (
    <div className="recruitment-theme apply-font-override min-h-screen bg-[var(--surface-base)] text-[var(--dim-grey)]">
      <Sidebar initialMe={me} />
      <Topbar initialMe={me} />

      <div className="fixed left-72 right-4 top-4 bottom-4 z-10 hidden flex-col xl:right-[22rem] md:flex">
        <div className="h-20 shrink-0" aria-hidden="true" />
        <div className="glass-panel flex-1 overflow-auto rounded-3xl">
          <div className="page-shell py-4">{children}</div>
        </div>
      </div>

      <div className="fixed left-4 right-4 top-24 bottom-4 z-10 flex flex-col md:hidden">
        <div className="glass-panel flex-1 overflow-auto rounded-3xl">
          <div className="page-shell py-4">{children}</div>
        </div>
      </div>

      {!hideContextPanel ? (
        <div className="fixed right-4 top-4 bottom-4 z-10 hidden w-80 flex-col xl:flex">
          <div className="h-20 shrink-0" aria-hidden="true" />
          <ContextPanel className="flex-1 overflow-auto" />
        </div>
      ) : null}
    </div>
  );
}
