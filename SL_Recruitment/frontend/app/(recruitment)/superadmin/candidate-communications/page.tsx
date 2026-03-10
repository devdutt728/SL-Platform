import { SuperAdminToolsHeader } from "../SuperAdminToolsHeader";
import { CandidateCommunicationsPanel } from "../features/candidate-communications/CandidateCommunicationsPanel";
import { requireSuperadminAccess } from "../server";

export default async function SuperAdminCandidateCommunicationsPage() {
  await requireSuperadminAccess();

  return (
    <>
      <SuperAdminToolsHeader active="candidate-communications" />
      <div className="content-pad mt-4">
        <CandidateCommunicationsPanel />
      </div>
    </>
  );
}
