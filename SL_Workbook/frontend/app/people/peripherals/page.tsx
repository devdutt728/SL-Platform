import { PeopleAccessRequired } from "../_components/PeopleAccessRequired";
import { PeopleHeader } from "../_components/PeopleHeader";
import { hasPeopleAccess } from "../_lib/access-server";
import { PeripheralsClient } from "./PeripheralsClient";

export default async function PeripheralsPage() {
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
      <PeopleHeader crumb={[{ label: "Peripherals" }]} />
      <div className="mx-auto w-full max-w-[1560px]">
        <div className="mb-6">
          <p className="public-kicker">Operating Console</p>
          <h1 className="mt-2 text-4xl font-semibold text-slate-900">Peripherals</h1>
          <p className="mt-2 max-w-2xl text-sm text-steel">Projectors, printers, UPS units, and assignable support inventory.</p>
        </div>
        <PeripheralsClient />
      </div>
    </div>
  );
}
