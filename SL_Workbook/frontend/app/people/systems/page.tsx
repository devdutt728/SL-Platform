import { PeopleHeader } from "../_components/PeopleHeader";
import { SystemsClient } from "./SystemsClient";

export default function SystemsPage() {
  return (
    <div className="page-shell min-h-screen pb-10 pt-24">
      <PeopleHeader crumb={[{ label: "Systems" }]} />
      <div className="mx-auto w-full max-w-[1860px] px-3 sm:px-5">
        <SystemsClient />
      </div>
    </div>
  );
}
