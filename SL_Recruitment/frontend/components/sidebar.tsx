"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Home, Users, Briefcase, LayoutDashboard, CalendarClock, FileSignature, BarChart3, Shield } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, guard: "all" },
  { href: "/candidates", label: "Candidates", icon: Users, guard: "interviewer" },
  { href: "/openings", label: "Openings", icon: Briefcase, guard: "hr" },
  { href: "/interviewer", label: "Interviewer", icon: CalendarClock, guard: "interviewer" },
  { href: "/gl-portal", label: "GL Portal", icon: CalendarClock, guard: "gl" },
  { href: "/offers", label: "Offers", icon: FileSignature, guard: "offers" },
  { href: "/reports", label: "Reports", icon: BarChart3, guard: "reports" },
  { href: "/", label: "Home", icon: Home, guard: "all" },
];

type SidebarMe = {
  platform_role_id?: number | string | null;
  platform_role_code?: string | null;
  roles?: string[] | null;
  platform_role_codes?: string[] | null;
};

export function Sidebar({ initialMe }: { initialMe: SidebarMe | null }) {
  const pathname = usePathname();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const normalizedPath = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  const logoSrc = `${basePath}/Studio Lotus Logo (TM).png`;
  const roleIdRaw = initialMe?.platform_role_id ?? null;
  const roleId = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
  const isSuperadmin = roleId === 2 || (initialMe?.platform_role_code ?? "").trim() === "2";
  const roles = useMemo(() => {
    const roleSet = new Set<string>();
    (initialMe?.roles || []).forEach((role) => roleSet.add(String(role)));
    (initialMe?.platform_role_codes || []).forEach((role) => roleSet.add(String(role)));
    if (initialMe?.platform_role_code) roleSet.add(String(initialMe.platform_role_code));
    return Array.from(roleSet);
  }, [initialMe]);

  const guards = useMemo(() => {
    const normalized = roles.map((role) => role.toLowerCase());
    const has = (value: string) => normalized.includes(value);
    const isHrAdmin = has("hr_admin");
    const isHr = isHrAdmin || has("hr_exec");
    const isRole6 = has("6");
    const isGl = has("hiring_manager") || has("gl") || has("interviewer") || isHr;
    const isInterviewer = has("interviewer") || isGl || isHr;
    const canOffers = has("approver") || isHr;
    const canReports = isHrAdmin;
    return {
      all: true,
      hr: isHr || isRole6,
      interviewer: isInterviewer,
      gl: isGl,
      offers: canOffers,
      reports: canReports,
    };
  }, [roles]);

  return (
    <aside className="glass-panel fixed bottom-4 left-4 top-4 z-20 w-56 overflow-hidden rounded-2xl p-4">
      <div className="px-2 pb-4">
        <div className="h-12 w-full">
          <img src={logoSrc} alt="Studio Lotus" className="h-full w-auto object-contain object-left" />
        </div>
      </div>
      <nav className="space-y-1">
        {navItems.filter((item) => guards[item.guard as keyof typeof guards]).map((item) => {
          const active = item.href === "/" ? normalizedPath === "/" : normalizedPath.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--dim-grey)] transition",
                active
                  ? "bg-[rgba(231,64,17,0.1)] text-[var(--dim-grey)] shadow-md ring-1 ring-[rgba(231,64,17,0.25)]"
                  : "hover:bg-white/40 hover:text-[var(--dim-grey)]"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {isSuperadmin ? (
          <Link
            href="/superadmin"
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--dim-grey)] transition",
              normalizedPath.startsWith("/superadmin")
                ? "bg-[rgba(231,64,17,0.1)] text-[var(--dim-grey)] shadow-md ring-1 ring-[rgba(231,64,17,0.25)]"
                : "hover:bg-white/40 hover:text-[var(--dim-grey)]"
            )}
          >
            <Shield className="h-4 w-4" />
            <span>SuperAdmin</span>
          </Link>
        ) : null}
      </nav>
    </aside>
  );
}
