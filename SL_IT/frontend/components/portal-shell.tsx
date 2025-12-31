"use client";

import { ModuleTabs } from "@/components/module-tabs";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <Topbar />

      <div className="fixed left-72 right-4 top-4 bottom-4 z-10 hidden flex-col md:flex">
        <div className="h-20 shrink-0" aria-hidden="true" />
        <div className="glass-panel flex-1 overflow-auto rounded-3xl">
          <div className="page-shell py-4">
            <ModuleTabs />
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>

      <div className="fixed left-4 right-4 top-24 bottom-4 z-10 flex flex-col md:hidden">
        <div className="glass-panel flex-1 overflow-auto rounded-3xl">
          <div className="page-shell py-4">
            <ModuleTabs />
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
