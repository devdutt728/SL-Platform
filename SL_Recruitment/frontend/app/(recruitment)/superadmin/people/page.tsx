import { PeoplePanel } from "../features/people/PeoplePanel";
import { SuperAdminToolsHeader } from "../SuperAdminToolsHeader";
import { requireSuperadminAccess } from "../server";

export default async function SuperAdminPeoplePage() {
  await requireSuperadminAccess();

  return (
    <>
      <SuperAdminToolsHeader active="people" />
      <div className="content-pad mt-4">
        <PeoplePanel />
      </div>
    </>
  );
}
