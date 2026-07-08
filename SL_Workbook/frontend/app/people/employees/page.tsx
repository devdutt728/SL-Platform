import { PeopleAccessRequired } from "../_components/PeopleAccessRequired";
import { PeopleHeader } from "../_components/PeopleHeader";
import { isPeopleSuperadmin } from "../_lib/access-server";
import { DirectoryClient } from "./DirectoryClient";

export const metadata = { title: "Employee Directory · People" };

export default async function EmployeeDirectoryPage() {
  if (!(await isPeopleSuperadmin())) {
    return <PeopleAccessRequired title="Employee directory needs superadmin access" />;
  }

  return (
    <div className="page-shell min-h-screen pb-12 pt-24">
      <PeopleHeader crumb={[{ label: "Employees" }]} />
      <div className="mx-auto w-full max-w-[1560px]">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-slate-900">Employee Directory</h1>
          <p className="mt-1 text-sm text-steel">Search, filter, and open any employee profile.</p>
        </div>
        <DirectoryClient />
      </div>
    </div>
  );
}
