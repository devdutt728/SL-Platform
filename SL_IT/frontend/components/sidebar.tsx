"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  Boxes,
  ClipboardList,
  Bell,
  LayoutDashboard,
  Package,
  FileBarChart,
  ScanLine,
  ShieldCheck,
  KeyRound,
  UserCog,
  UserRoundCheck,
  Wallet,
  Wrench,
  X,
} from "lucide-react";

const navItems = {
  core: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, soon: false },
    { href: "/assets", label: "Assets", icon: Boxes, soon: false },
    { href: "/allotments", label: "Allotments", icon: ScanLine, soon: false },
    { href: "/repairs", label: "Repairs", icon: Wrench, soon: false },
    { href: "/purchases", label: "Purchases", icon: ClipboardList, soon: false },
    { href: "/licenses", label: "Licenses", icon: KeyRound, soon: false },
    { href: "/consumables", label: "Consumables", icon: Package, soon: false },
    { href: "/finance", label: "Finance", icon: Wallet, soon: false },
    { href: "/reports", label: "Reports", icon: FileBarChart, soon: false },
    { href: "/alerts", label: "Alerts", icon: Bell, soon: false },
    { href: "/my-assets", label: "My Assets", icon: UserRoundCheck, soon: false },
  ],
  admin: [
    { href: "/admin/users", label: "User management", icon: ShieldCheck, soon: false },
    { href: "/admin/settings", label: "IMS settings", icon: UserCog, soon: false },
  ],
};

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
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
    return normalized.some((role) => ["superadmin", "s_admin", "admin", "ims_admin", "ims_manager"].includes(role));
  }, [roles]);
  const canManageUsers = useMemo(() => {
    const normalized = roles.map((role) => role.toLowerCase());
    return normalized.some((role) => ["superadmin", "s_admin"].includes(role));
  }, [roles]);
  const adminItems = useMemo(
    () => navItems.admin.filter((item) => item.href !== "/admin/users" || canManageUsers),
    [canManageUsers]
  );

  const renderItem = (item: { href: string; label: string; icon: any; soon?: boolean }) => {
    const active = item.href === "/" ? normalizedPath === "/" : normalizedPath.startsWith(item.href);
    const Icon = item.icon;
    const classes = clsx(
      "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition",
      active
        ? "bg-white/60 text-slate-900 shadow-md ring-1 ring-white/70"
        : "text-slate-700 hover:bg-white/40 hover:text-slate-900",
      item.soon && "cursor-not-allowed opacity-55 hover:bg-transparent hover:text-slate-700"
    );
    const inner = (
      <>
        <span className="flex items-center gap-3">
          <Icon className="h-4 w-4" />
          <span>{item.label}</span>
        </span>
        {item.soon ? (
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-500">
            soon
          </span>
        ) : null}
      </>
    );
    if (item.soon) {
      return (
        <div key={item.href} className={classes} aria-disabled="true">
          {inner}
        </div>
      );
    }
    return (
      <Link key={item.href} href={item.href} className={classes} onClick={onClose}>
        {inner}
      </Link>
    );
  };

  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}
      <aside
        className={clsx(
          "glass-panel fixed bottom-4 left-4 top-4 z-40 w-56 overflow-y-auto rounded-2xl p-4 transition-transform duration-200 md:z-20 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-[120%]"
        )}
      >
        <div className="flex items-start justify-between px-2 pb-4">
          <div>
            <div className="h-12 w-full">
              <img src={logoSrc} alt="Studio Lotus" className="h-full w-auto object-contain object-left" />
            </div>
            <p className="mt-2 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-400">
              Inventory · IMS
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="mt-1 rounded-lg p-1 text-slate-400 hover:bg-white/50 hover:text-slate-600 md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="space-y-4">
          <div className="space-y-1">{navItems.core.map(renderItem)}</div>
          {canAdmin ? (
            <div>
              <p className="px-3 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Admin</p>
              <div className="mt-2 space-y-1">{adminItems.map(renderItem)}</div>
            </div>
          ) : null}
        </nav>
      </aside>
    </>
  );
}
