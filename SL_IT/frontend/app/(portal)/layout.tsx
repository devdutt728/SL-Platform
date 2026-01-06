"use client";

import Link from "next/link";

import { PortalShell } from "@/components/portal-shell";
import { useUser } from "@/components/user-context";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/it";
  const { user, loading } = useUser();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-steel">
        Loading Studio Lotus Platform...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-panel p-10 max-w-md text-center">
          <h1 className="text-2xl font-semibold">Sign in required</h1>
          <p className="mt-3 text-steel">
            Use your @studiolotus.in account to access the portal.
          </p>
          <Link
            className="inline-flex mt-6 px-6 py-3 rounded-full bg-ink text-white font-semibold"
            href={`${basePath}/login`}
          >
            Continue to sign in
          </Link>
        </div>
      </div>
    );
  }

  return <PortalShell>{children}</PortalShell>;
}
