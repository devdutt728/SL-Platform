"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Home, Users, Briefcase, LayoutDashboard, CalendarClock, FileSignature, FolderOpen } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/openings", label: "Openings", icon: Briefcase },
  { href: "/sprint-templates", label: "Sprint Templates", icon: FolderOpen },
  { href: "/interviewer", label: "Interviewer", icon: CalendarClock },
  { href: "/offers", label: "Offers", icon: FileSignature },
  { href: "/", label: "Home", icon: Home },
];

export function Sidebar() {
  const pathname = usePathname();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const normalizedPath = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  const logoSrc = `${basePath}/Studio Lotus Logo (TM).png`;

  return (
    <aside className="glass-panel fixed bottom-4 left-4 top-4 z-20 w-56 overflow-hidden rounded-2xl p-4">
      <div className="px-2 pb-4">
        <div className="h-12 w-full">
          <img src={logoSrc} alt="Studio Lotus" className="h-full w-auto object-contain object-left" />
        </div>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = item.href === "/" ? normalizedPath === "/" : normalizedPath.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 transition",
                active
                  ? "bg-white/60 text-slate-900 shadow-md ring-1 ring-white/70"
                  : "hover:bg-white/40 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
