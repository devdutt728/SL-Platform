"use client";

import { LogOut, Sparkles, User } from "lucide-react";

import { useUser } from "@/components/user-context";

function firstName(source: string) {
  const trimmed = (source || "").trim();
  if (!trimmed) return "User";
  const token = trimmed.split(/\s+/)[0] || trimmed;
  const cleaned = token.split("@")[0];
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : "User";
}

export function Topbar() {
  const { user, loading } = useUser();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/it";
  const roleLabel = user?.platform_role_name || user?.platform_role_code || user?.roles?.[0] || "Member";

  const handleSignOut = async () => {
    await fetch(`${basePath}/api/auth/logout`, { method: "POST" });
    window.location.href = `${basePath}/login`;
  };

  return (
    <header className="glass-panel fixed left-4 right-4 top-4 z-20 hidden h-16 overflow-hidden rounded-2xl md:flex md:left-72">
      <div className="page-shell flex h-full items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold text-slate-800">IT Helpdesk</span>
          <span className="rounded-full border border-white/60 bg-white/30 px-3 py-1 text-xs font-semibold text-slate-700">
            Internal
          </span>
        </div>

        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-10 w-52 animate-pulse rounded-xl bg-white/20" />
          ) : user ? (
            <div className="flex items-center gap-2 rounded-xl bg-gradient-to-tr from-slate-900/90 to-emerald-500 px-3 py-2 text-sm font-medium text-white shadow-lg">
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
              className="rounded-xl border border-white/60 bg-white/30 px-3 py-2 text-sm font-semibold text-slate-800 backdrop-blur"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
