import { PeopleHeader } from "../../_components/PeopleHeader";
import { ChangelogClient } from "./ChangelogClient";

export const metadata = { title: "Org Change Log · People" };

export default function OrgChangelogPage() {
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
