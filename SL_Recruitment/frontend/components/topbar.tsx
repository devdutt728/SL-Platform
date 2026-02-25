"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Sparkles, User } from "lucide-react";

type Me = {
  email?: string;
  full_name?: string | null;
  roles?: string[] | null;
  platform_role_code?: string | null;
  platform_role_name?: string | null;
  platform_role_codes?: string[] | null;
  platform_role_names?: string[] | null;
};

const roleLabel: Record<string, string> = {
  hr_admin: "Superadmin",
  hr_exec: "HR",
  interviewer: "Interviewer",
  hiring_manager: "GL",
  approver: "Approver",
  viewer: "Viewer",
};

function firstName(me: Me) {
  const source = (me.full_name || "").trim() || (me.email || "");
  const token = source.split(/\s+/)[0] || source;
  const cleaned = token.split("@")[0];
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : "User";
}

export function Topbar({ initialMe }: { initialMe: Me | null }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const pathname = usePathname();
  const me = initialMe;

  const displayRoles = useMemo(() => {
    if (!me) return [];
    const names = (me.platform_role_names || []).filter(Boolean);
    if (names.length) return names;
    const combined = new Set<string>();
    (me.roles || []).forEach((role) => combined.add(role));
    (me.platform_role_codes || []).forEach((role) => combined.add(role));
    if (me.platform_role_code) combined.add(me.platform_role_code);
    const labels = Array.from(combined).map((role) => roleLabel[role] || role).filter(Boolean);
    return labels.length ? labels : [me.platform_role_name || "Viewer"];
  }, [me]);

  const sectionLabel = useMemo(() => {
    const normalized = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
    const first = normalized.split("/").filter(Boolean)[0] || "dashboard";
    const map: Record<string, string> = {
      dashboard: "Dashboard",
      candidates: "Candidates",
      openings: "Openings",
      offers: "Offers",
      reports: "Reports",
      "sprint-templates": "Sprint templates",
      interviewer: "Interviewer",
      "gl-portal": "GL portal",
      superadmin: "Superadmin",
    };
    return map[first] || "Workspace";
  }, [pathname, basePath]);

  async function signOut() {
    await fetch(`${basePath}/api/auth/logout`, { method: "POST" });
    window.location.href = "/";
  }

  return (
    <header className="glass-panel fixed top-4 right-4 z-20 hidden h-16 overflow-visible rounded-2xl md:flex md:left-24 2xl:left-72">
      <div className="page-shell flex h-full items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Sparkles className="h-4 w-4 text-[var(--brand-color)]" />
          <span className="truncate text-sm font-semibold text-[var(--dim-grey)]">Recruitment</span>
          <span className="hidden rounded-full border border-[var(--accessible-components--dark-grey)] bg-white/70 px-3 py-1 text-xs font-semibold text-[var(--dim-grey)] lg:inline-flex">
            Beta
          </span>
          <span className="hidden text-xs font-semibold text-[var(--dim-grey)] xl:inline">
            / {sectionLabel}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <details className="relative hidden lg:block">
            <summary className="cursor-pointer list-none rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--dim-grey)] backdrop-blur">
              Apps
            </summary>
            <div className="absolute right-0 mt-2 w-44 rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white/95 p-2 text-xs font-semibold text-[var(--dim-grey)] shadow-lg">
              <a href="/" className="block rounded-lg px-2 py-2 hover:bg-[var(--surface-card)]">
                Public portal
              </a>
              <a href="/employee" className="block rounded-lg px-2 py-2 hover:bg-[var(--surface-card)]">
                Workbook
              </a>
              <a href="/dashboard" className="block rounded-lg px-2 py-2 hover:bg-[var(--surface-card)]">
                Recruitment
              </a>
              <a href="/it" className="block rounded-lg px-2 py-2 hover:bg-[var(--surface-card)]">
                IT Helpdesk
              </a>
            </div>
          </details>
          {me ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white/75 px-2 py-1.5 text-sm font-medium text-[var(--dim-grey)] shadow-sm xl:px-3 xl:py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(231,64,17,0.1)] text-[var(--brand-color)]">
                <User className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <p className="text-xs tracking-tight text-[var(--dim-grey)]">{firstName(me)}</p>
                <p className="hidden text-sm text-[var(--dim-grey)] xl:block">{displayRoles.join(", ")}</p>
              </div>
              <button
                onClick={signOut}
                className="ml-1 inline-flex items-center gap-1 rounded-lg border border-[var(--accessible-components--dark-grey)] bg-white px-2 py-1 text-xs font-semibold text-[var(--dim-grey)] hover:bg-[var(--surface-card)]"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white/70 px-3 py-2 text-sm font-semibold text-[var(--dim-grey)] backdrop-blur"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
