import { PeopleHeader } from "../_components/PeopleHeader";
import { GroupsClient } from "./GroupsClient";

export default function GroupsPage() {
  return (
    <div className="page-shell min-h-screen pb-10 pt-24">
      <PeopleHeader crumb={[{ label: "Groups" }]} />
      <div className="mx-auto w-full max-w-[1560px]">
        <div className="mb-6">
          <p className="public-kicker">Operating Console</p>
          <h1 className="mt-2 text-4xl font-semibold text-slate-900">Groups</h1>
          <p className="mt-2 max-w-2xl text-sm text-steel">Executive view of group leadership, readiness, system coverage, and license risk.</p>
        </div>
        <GroupsClient />
      </div>
    </div>
  );
}
