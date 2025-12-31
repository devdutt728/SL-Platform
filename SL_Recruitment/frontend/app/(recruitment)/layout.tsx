import { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { ContextPanel } from "@/components/context-panel";
import { requireAuth } from "@/lib/require-auth";

export default async function RecruitmentLayout({ children }: { children: ReactNode }) {
  await requireAuth();

  return (
    <div className="min-h-screen">
      <Sidebar />
      <Topbar />

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

      <div className="fixed right-4 top-4 bottom-4 z-10 hidden w-80 flex-col xl:flex">
        <div className="h-20 shrink-0" aria-hidden="true" />
        <ContextPanel className="flex-1 overflow-auto" />
      </div>
    </div>
  );
}
