"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ToastProvider } from "@/components/ui/toast-provider";
import { CommandPalette } from "@/components/command-palette";

export function GlobalUxShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const showRecruitmentUx =
    pathname.startsWith(basePath) ||
    ["/dashboard", "/candidates", "/openings", "/offers", "/reports", "/interviewer", "/gl-portal", "/activity"].some((route) =>
      pathname.startsWith(route)
    );

  return (
    <ToastProvider>
      {children}
      {showRecruitmentUx ? <CommandPalette /> : null}
    </ToastProvider>
  );
}
