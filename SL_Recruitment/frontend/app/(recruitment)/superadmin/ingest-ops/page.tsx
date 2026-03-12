import { IngestOpsPanel } from "../features/ingest-ops/IngestOpsPanel";
import { SuperAdminToolsHeader } from "../SuperAdminToolsHeader";
import { fetchOpeningsForSuperadmin, requireSuperadminAccess } from "../server";

export default async function SuperAdminIngestOpsPage() {
  await requireSuperadminAccess();
  const openings = await fetchOpeningsForSuperadmin();

  return (
    <>
      <SuperAdminToolsHeader active="ingest-ops" />
      <div className="superadmin-shell">
        <IngestOpsPanel openings={openings.map((item) => ({ opening_id: item.opening_id, title: item.title, opening_code: item.opening_code }))} />
      </div>
    </>
  );
}
