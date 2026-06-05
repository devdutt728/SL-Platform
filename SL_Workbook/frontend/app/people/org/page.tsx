import { PeopleHeader } from "../_components/PeopleHeader";
import { OrgClient } from "./OrgClient";

export const metadata = { title: "Org Chart · People" };

export default function OrgChartPage() {
  return (
    <div className="page-shell min-h-screen pb-12 pt-24">
      <PeopleHeader crumb={[{ label: "Org" }]} back="/people" />
      <div className="mx-auto w-full">
        <OrgClient />
      </div>
    </div>
  );
}
