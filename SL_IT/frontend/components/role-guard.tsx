"use client";

import { useUser } from "@/components/user-context";

export function RoleGuard({
  allowed,
  children,
}: {
  allowed: string[];
  children: React.ReactNode;
}) {
  const { user } = useUser();
  if (!user) return null;
  if (user.roles?.includes("superadmin") || user.roles?.some((role) => allowed.includes(role))) {
    return <>{children}</>;
  }
  return (
    <div className="section-card text-steel">
      You do not have access to this section.
    </div>
  );
}
