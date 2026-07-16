"use client";

import { useState } from "react";

import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export function PortalShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <Topbar onMenuClick={() => setNavOpen(true)} />

      <div className="fixed left-4 right-4 top-24 bottom-4 z-10 flex flex-col md:left-72">
        <div className="glass-panel flex-1 overflow-auto rounded-3xl">
          <div className="page-shell py-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
