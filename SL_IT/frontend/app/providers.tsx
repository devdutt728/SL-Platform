"use client";

import { UserProvider } from "@/components/user-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <UserProvider>{children}</UserProvider>;
}
