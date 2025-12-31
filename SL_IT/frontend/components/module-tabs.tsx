"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabs = [
  { label: "IT Helpdesk", href: "/queue" },
  { label: "Admin", href: "/admin/users" },
];

export function ModuleTabs() {
  const pathname = usePathname();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const normalizedPath = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  return (
    <div className="flex gap-3 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.href === "/" ? normalizedPath === "/" : normalizedPath.startsWith(tab.href);
        const classes = cn(
          "rounded-t-2xl px-5 py-3 text-sm font-semibold border backdrop-blur",
          active
            ? "bg-white border-white/60 shadow-card"
            : "bg-white/50 border-transparent text-steel hover:text-ink"
        );
        return (
          <Link key={tab.label} href={tab.href} className={classes}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
