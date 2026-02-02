"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Home, KeyRound, Laptop, LayoutDashboard, ListChecks, PlusCircle, Settings, ShieldCheck } from "lucide-react";

const navItems = {
  core: [
    { href: "/queue", label: "Queue", icon: LayoutDashboard },
    { href: "/my", label: "My tickets", icon: ListChecks },
    { href: "/new", label: "Create ticket", icon: PlusCircle },
  ],
  admin: [
    { href: "/admin/users", label: "User management", icon: ShieldCheck },
    { href: "/admin/it", label: "IT policies", icon: Settings },
    { href: "/admin/it/assets", label: "Assets", icon: Laptop },
    { href: "/admin/it/licenses", label: "Licenses", icon: KeyRound },
  ],
  home: [{ href: "/", label: "Home", icon: Home }],
};

export function Sidebar() {
  const pathname = usePathname();
  const [roles, setRoles] = useState<string[]>([]);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/it";
  const normalizedPath = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  const logoSrc = `${basePath}/studio-lotus-logo.png`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${basePath}/api/auth/me`, { cache: "no-store" });
        if (!res.ok) return;
        const me = (await res.json()) as { roles?: string[]; platform_role_codes?: string[] | null; platform_role_code?: string | null };
        if (cancelled) return;
        const roleSet = new Set<string>();
        (me.roles || []).forEach((role) => roleSet.add(String(role)));
        (me.platform_role_codes || []).forEach((role) => roleSet.add(String(role)));
        if (me.platform_role_code) roleSet.add(String(me.platform_role_code));
        setRoles(Array.from(roleSet));
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [basePath]);

  const canAdmin = useMemo(() => {
    const normalized = roles.map((role) => role.toLowerCase());
    return normalized.some((role) => ["superadmin", "admin", "it_lead"].includes(role));
  }, [roles]);

  return (
    <aside className="glass-panel fixed bottom-4 left-4 top-4 z-20 w-56 overflow-hidden rounded-2xl p-4">
      <div className="px-2 pb-4">
        <div className="h-12 w-full">
          <img
            src={logoSrc}
            alt="Studio Lotus"
            className="h-full w-auto object-contain object-left"
          />
        </div>
      </div>
      <nav className="space-y-4">
        <div className="space-y-1">
          {navItems.core.map((item) => {
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
        </div>
        {canAdmin ? (
          <div>
            <p className="px-3 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-400">
              Admin
            </p>
            <div className="mt-2 space-y-1">
              {navItems.admin.map((item) => {
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
            </div>
          </div>
        ) : null}
        <div className="space-y-1">
          {navItems.home.map((item) => {
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
        </div>
      </nav>
    </aside>
  );
}
