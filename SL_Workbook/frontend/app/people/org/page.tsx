import { PeopleAccessRequired } from "../_components/PeopleAccessRequired";
import { PeopleHeader } from "../_components/PeopleHeader";
import { hasPeopleAccess } from "../_lib/access-server";
import { OrgClient } from "./OrgClient";

export const metadata = { title: "Org Chart · People" };

export default async function OrgChartPage() {
  if (!(await hasPeopleAccess())) {
    return (
      <PeopleAccessRequired
        title="People access required"
        message="This People console is restricted to authorized Studio Lotus staff. Sign in with an account that has People access, or ask an administrator to grant it."
      />
    );
  }

  return (
    <div className="page-shell min-h-screen pb-12 pt-24">
      <PeopleHeader crumb={[{ label: "Org" }]} back="/people" />
      <div className="mx-auto w-full">
        <OrgClient />
      </div>
    </div>
  );
}
