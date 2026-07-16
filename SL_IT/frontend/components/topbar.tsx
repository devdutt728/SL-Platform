"use client";

import { LogOut, Menu, Search, Sparkles, User } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useUser } from "@/components/user-context";

function firstName(source: string) {
  const trimmed = (source || "").trim();
  if (!trimmed) return "User";
  const token = trimmed.split(/\s+/)[0] || trimmed;
  const cleaned = token.split("@")[0];
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : "User";
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, loading } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [scan, setScan] = useState("");
  const [scanError, setScanError] = useState("");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/it";
  const roleLabel = user?.platform_role_name || user?.platform_role_code || user?.roles?.[0] || "Member";

  const sectionLabel = useMemo(() => {
    const normalized = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
    const first = normalized.split("/").filter(Boolean)[0] || "dashboard";
    const map: Record<string, string> = {
      dashboard: "Dashboard",
      assets: "Assets",
      allotments: "Allotments",
      repairs: "Repairs",
      purchases: "Purchases",
      licenses: "Licenses",
      consumables: "Consumables",
      finance: "Finance",
      reports: "Reports",
      alerts: "Alerts",
      "my-assets": "My Assets",
      admin: "Admin",
    };
    return map[first] || "Dashboard";
  }, [pathname, basePath]);

  const handleSignOut = async () => {
    await fetch(`${basePath}/api/auth/logout`, { method: "POST" });
    window.location.href = "/";
  };

  const handleScan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = scan.trim();
    if (!code) return;
    setScanError("");
    const res = await fetch(`${basePath}/api/ims/scan/${encodeURIComponent(code)}`, { cache: "no-store" });
    if (!res.ok) {
      setScanError("Scan failed");
      return;
    }
    const data = await res.json();
    if (data?.found && data?.asset?.asset_id) {
      setScan("");
      router.push(`/assets/${data.asset.asset_id}`);
    } else {
      setScanError("No match");
    }
  };

  return (
    <header className="glass-panel fixed left-4 right-4 top-4 z-20 flex h-16 overflow-hidden rounded-2xl md:left-72">
      <div className="page-shell flex h-full items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onMenuClick}
            aria-label="Open menu"
            className="-ml-1 rounded-lg p-1.5 text-slate-600 hover:bg-white/50 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Sparkles className="hidden h-4 w-4 text-brand sm:block" />
          <span className="hidden truncate text-sm font-semibold text-slate-800 sm:inline">Studio Lotus IMS</span>
          <span className="hidden rounded-full border border-slate-300/80 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 md:inline">
            IT Inventory
          </span>
          <span className="truncate text-xs font-semibold text-slate-500">
            / {sectionLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <form onSubmit={handleScan} className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={scan}
              onChange={(event) => setScan(event.target.value)}
              placeholder="Scan tag / serial"
              className="h-9 w-32 rounded-full border border-slate-300 bg-white/85 pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-brand/25 sm:w-52"
            />
            {scanError ? <span className="absolute right-2 top-10 text-[0.65rem] font-semibold text-red-600">{scanError}</span> : null}
          </form>
          <details className="relative hidden sm:block">
            <summary className="cursor-pointer list-none rounded-xl border border-slate-300/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-800 backdrop-blur">
              Apps
            </summary>
            <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white/95 p-2 text-xs font-semibold text-slate-700 shadow-lg">
              <a href="/" className="block rounded-lg px-2 py-2 hover:bg-slate-50">
                Public portal
              </a>
              <a href="/employee" className="block rounded-lg px-2 py-2 hover:bg-slate-50">
                Workbook
              </a>
              <a href="/recruitment/dashboard" className="block rounded-lg px-2 py-2 hover:bg-slate-50">
                Recruitment
              </a>
              <a href="/it" className="block rounded-lg px-2 py-2 hover:bg-slate-50">
                IMS · IT Inventory
              </a>
            </div>
          </details>
          {loading ? (
            <div className="h-10 w-52 animate-pulse rounded-xl bg-slate-200/70" />
          ) : user ? (
            <div className="flex items-center gap-2 rounded-xl bg-gradient-to-tr from-brand/95 to-[#c53a0f] px-3 py-2 text-sm font-medium text-white shadow-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/25">
                <User className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <p className="text-xs tracking-tight text-white/80">{firstName(user.full_name || user.email || "")}</p>
                <p className="text-sm">{roleLabel}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="ml-2 inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-xs font-semibold hover:bg-white/20"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          ) : (
            <a
              href={`${basePath}/login`}
              className="rounded-xl border border-slate-300/80 bg-white/85 px-3 py-2 text-sm font-semibold text-slate-800 backdrop-blur"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
