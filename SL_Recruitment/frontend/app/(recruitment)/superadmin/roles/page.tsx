import { RolesPanel } from "../features/roles/RolesPanel";
import { SuperAdminToolsHeader } from "../SuperAdminToolsHeader";
import { requireSuperadminAccess } from "../server";

export default async function SuperAdminRolesPage() {
  await requireSuperadminAccess();

  return (
    <>
      <SuperAdminToolsHeader active="roles" />
      <RolesPanel />
    </>
  );
}
