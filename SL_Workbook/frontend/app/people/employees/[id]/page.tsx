import { PeopleHeader } from "../../_components/PeopleHeader";
import { isPeopleSuperadmin } from "../../_lib/access-server";
import { ProfileClient } from "./ProfileClient";
import { notFound } from "next/navigation";

export const metadata = { title: "Employee Profile · People" };

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isPeopleSuperadmin())) notFound();

  const { id } = await params;
  return (
    <div className="page-shell min-h-screen pb-12 pt-24">
      <PeopleHeader crumb={[{ label: "Employees", href: "/people/employees" }, { label: "Profile" }]} />
      <div className="mx-auto w-full max-w-[1560px]">
        <ProfileClient employeeId={id} />
      </div>
    </div>
  );
}
