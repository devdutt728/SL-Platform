import { redirect } from "next/navigation";
import { requireSuperadminAccess } from "./server";

export default async function SuperAdminPage() {
  await requireSuperadminAccess();
  redirect("/superadmin/ingest-ops");
}


