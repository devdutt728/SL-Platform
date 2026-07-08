import { PeopleAccessRequired } from "../../_components/PeopleAccessRequired";
import { PeopleHeader } from "../../_components/PeopleHeader";
import { hasPeopleAccess } from "../../_lib/access-server";
import { ChangelogClient } from "./ChangelogClient";

export const metadata = { title: "Org Change Log · People" };

export default async function OrgChangelogPage() {
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
      <PeopleHeader crumb={[{ label: "Org Chart", href: "/people/org" }, { label: "Change log" }]} />
      <div className="mx-auto w-full max-w-[1560px]">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-slate-900">Org Change Log</h1>
          <p className="mt-1 text-sm text-steel">Every publish and revert, with the people who moved.</p>
        </div>
        <ChangelogClient />
      </div>
    </div>
  );
}
