import ReportsClient from "./ReportsClient";
import { getAuthMe } from "@/lib/auth-me";
import { canAccessReports } from "@/lib/reports-access";
import { notFound } from "next/navigation";

export default async function ReportsPage() {
  const me = await getAuthMe();
  const canAccess = canAccessReports(me);
  if (!canAccess) notFound();

  return <ReportsClient canAccess={canAccess} />;
}
