import { ReportsAccessPanel } from "../features/reports-access/ReportsAccessPanel";
import { SuperAdminToolsHeader } from "../SuperAdminToolsHeader";
import { requireSuperadminAccess } from "../server";

export default async function SuperAdminReportsAccessPage() {
  await requireSuperadminAccess();

  return (
    <>
      <SuperAdminToolsHeader active="reports-access" />
      <div className="superadmin-shell">
        <ReportsAccessPanel />
      </div>
    </>
  );
}
