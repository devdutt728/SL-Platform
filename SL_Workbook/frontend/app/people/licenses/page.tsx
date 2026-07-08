import { PeopleAccessRequired } from "../_components/PeopleAccessRequired";
import { PeopleHeader } from "../_components/PeopleHeader";
import { hasPeopleAccess } from "../_lib/access-server";
import { LicensesClient } from "./LicensesClient";

export default async function PeopleLicensesPage() {
  if (!(await hasPeopleAccess())) {
    return (
      <PeopleAccessRequired
        title="People access required"
        message="This People console is restricted to authorized Studio Lotus staff. Sign in with an account that has People access, or ask an administrator to grant it."
      />
    );
  }

  return (
    <div className="page-shell min-h-screen pb-10 pt-24">
      <PeopleHeader crumb={[{ label: "Licenses" }]} />
      <div className="mx-auto w-full max-w-[1560px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="public-kicker">Operating Console</p>
            <h1 className="mt-2 text-4xl font-semibold text-slate-900">Licenses</h1>
            <p className="mt-2 max-w-2xl text-sm text-steel">
              Software assignment control, contract inventory, utilisation, and renewal risk.
            </p>
          </div>
        </div>
        <LicensesClient />
      </div>
    </div>
  );
}
