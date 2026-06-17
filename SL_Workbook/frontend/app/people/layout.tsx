import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasPeopleAccess } from "./_lib/access-server";

export default async function PeopleLayout({ children }: { children: ReactNode }) {
  if (!(await hasPeopleAccess())) notFound();
  return children;
}
