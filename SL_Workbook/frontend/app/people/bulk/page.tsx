import { notFound } from "next/navigation";
import { PeopleHeader } from "../_components/PeopleHeader";
import { isPeopleSuperadmin } from "../_lib/access-server";
import { BulkClient } from "./BulkClient";

export default async function PeopleBulkPage() {
  if (!(await isPeopleSuperadmin())) notFound();

  return (
    <div className="page-shell min-h-screen pb-10 pt-24">
      <PeopleHeader crumb={[{ label: "Bulk" }]} />
      <div className="mx-auto w-full max-w-[1560px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="public-kicker">Superadmin Console</p>
            <h1 className="mt-2 text-4xl font-semibold text-slate-900">Bulk & Reconciliation</h1>
            <p className="mt-2 max-w-3xl text-sm text-steel">
              Cross-check People, Org, Groups, Licenses, Systems, and Peripherals before any bulk upload or correction.
            </p>
          </div>
        </div>
        <BulkClient />
      </div>
    </div>
  );
}
