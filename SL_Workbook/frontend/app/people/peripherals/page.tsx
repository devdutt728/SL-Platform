import { PeopleHeader } from "../_components/PeopleHeader";
import { PeripheralsClient } from "./PeripheralsClient";

export default function PeripheralsPage() {
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
