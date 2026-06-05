import { PeopleHeader } from "../_components/PeopleHeader";
import { LicensesClient } from "./LicensesClient";

export default function PeopleLicensesPage() {
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
