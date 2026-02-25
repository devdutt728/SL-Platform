import { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { LiveActivityDock } from "@/components/live-activity-dock";
import { requireAuth } from "@/lib/require-auth";

export default async function RecruitmentLayout({ children }: { children: ReactNode }) {
  const me = await requireAuth();
  const hideContextPanel = false;

  return (
    <div className="recruitment-theme apply-font-override min-h-screen bg-[var(--surface-base)] text-[var(--dim-grey)]">
      <Sidebar initialMe={me} />
      <Topbar initialMe={me} />

      <div className="fixed top-4 right-4 bottom-4 left-24 z-10 hidden flex-col md:flex 2xl:left-72">
        <div className="h-20 shrink-0" aria-hidden="true" />
        <div className="glass-panel flex-1 overflow-auto rounded-3xl">
          <div className="page-shell py-4">{children}</div>
        </div>
      </div>

      <div className="fixed top-3 right-3 bottom-3 left-24 z-10 flex flex-col md:hidden">
        <div className="glass-panel flex-1 overflow-auto rounded-3xl">
          <div className="page-shell py-4">{children}</div>
        </div>
      </div>

      <LiveActivityDock hidden={hideContextPanel} />
    </div>
  );
}
