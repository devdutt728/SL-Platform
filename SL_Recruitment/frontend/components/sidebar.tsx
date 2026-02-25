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
  platform_role_ids?: Array<number | string> | null;
  platform_role_code?: string | null;
  platform_role_codes?: string[] | null;
  platform_role_name?: string | null;
  platform_role_names?: string[] | null;
  roles?: string[] | null;
};

function normalizeRole(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isHrRole(value: string) {
  if (!value) return false;
  const compact = value.replace(/_/g, "");
  if (value === "hr" || value.startsWith("hr_") || value.startsWith("hr")) return true;
  return compact.includes("humanresource");
}

function isGlRole(value: string) {
  if (!value) return false;
  return value === "gl" || value === "group_lead" || value === "grouplead" || value === "hiring_manager";
}

export function Sidebar({ initialMe }: { initialMe: SidebarMe | null }) {
  const pathname = usePathname();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const normalizedPath = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  const logoSrc = `${basePath}/Studio Lotus Logo (TM).png`;
  const roleIdRaw = initialMe?.platform_role_id ?? null;
  const parsedRoleId =
    roleIdRaw === null || roleIdRaw === undefined || String(roleIdRaw).trim() === ""
      ? NaN
      : typeof roleIdRaw === "number"
        ? roleIdRaw
        : Number(roleIdRaw);
  const roleId = Number.isFinite(parsedRoleId) ? parsedRoleId : null;
  const roleIds = useMemo(() => {
    const all = [roleId, ...((initialMe?.platform_role_ids || []).map((id) => {
      if (id === null || id === undefined || String(id).trim() === "") return NaN;
      return typeof id === "number" ? id : Number(id);
    }))];
    return all.filter((id): id is number => Number.isFinite(id));
  }, [initialMe?.platform_role_ids, roleId]);
  const normalizedRoles = useMemo(() => {
    const combined = [
      ...(initialMe?.roles || []),
      ...(initialMe?.platform_role_codes || []),
      ...(initialMe?.platform_role_names || []),
      initialMe?.platform_role_code || "",
      initialMe?.platform_role_name || "",
    ];
    return combined.map((role) => normalizeRole(role)).filter(Boolean);
  }, [
    initialMe?.platform_role_code,
    initialMe?.platform_role_codes,
    initialMe?.platform_role_name,
    initialMe?.platform_role_names,
    initialMe?.roles,
  ]);
  const isSuperadmin =
    roleIds.includes(2) || normalizedRoles.some((role) => ["2", "superadmin", "s_admin", "super_admin"].includes(role));
  const isRoleFiveOrSix = roleIds.includes(5) || roleIds.includes(6);
  const isHr = isSuperadmin || normalizedRoles.some((role) => isHrRole(role));
  const isGl = normalizedRoles.some((role) => isGlRole(role));
  const isInterviewer = normalizedRoles.includes("interviewer");

  const guards = useMemo(() => {
    return {
      all: true,
      hr: isHr || isRoleFiveOrSix,
      interviewer: isInterviewer || isGl || isRoleFiveOrSix || isHr,
      gl: isGl || isRoleFiveOrSix || isHr,
      offers: isHr || isSuperadmin,
      reports: isSuperadmin || normalizedRoles.includes("hr_admin"),
    };
  }, [isGl, isHr, isInterviewer, isRoleFiveOrSix, isSuperadmin, normalizedRoles]);

  return (
    <aside className="glass-panel fixed bottom-4 left-4 top-4 z-20 w-16 overflow-hidden rounded-2xl p-2 sm:w-20 sm:p-3 2xl:w-56 2xl:p-4">
      <div className="px-0.5 pb-3 2xl:px-2">
        <div className="hidden h-12 w-full 2xl:block">
          <img src={logoSrc} alt="Studio Lotus" className="h-full w-auto object-contain object-left" />
        </div>
        <div className="flex h-8 items-center justify-center 2xl:hidden">
          <img src={logoSrc} alt="Studio Lotus" className="h-8 w-8 object-contain" />
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
              title={item.label}
              className={clsx(
                "flex items-center justify-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--dim-grey)] transition 2xl:justify-start",
                active
                  ? "bg-[rgba(231,64,17,0.1)] text-[var(--dim-grey)] shadow-md ring-1 ring-[rgba(231,64,17,0.25)]"
                  : "hover:bg-white/40 hover:text-[var(--dim-grey)]"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden 2xl:inline">{item.label}</span>
            </Link>
          );
        })}
        {isSuperadmin ? (
          <Link
            href="/superadmin"
            title="SuperAdmin"
            className={clsx(
              "flex items-center justify-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--dim-grey)] transition 2xl:justify-start",
              normalizedPath.startsWith("/superadmin")
                ? "bg-[rgba(231,64,17,0.1)] text-[var(--dim-grey)] shadow-md ring-1 ring-[rgba(231,64,17,0.25)]"
                : "hover:bg-white/40 hover:text-[var(--dim-grey)]"
            )}
          >
            <Shield className="h-4 w-4" />
            <span className="hidden 2xl:inline">SuperAdmin</span>
          </Link>
        ) : null}
      </nav>
    </aside>
  );
}
