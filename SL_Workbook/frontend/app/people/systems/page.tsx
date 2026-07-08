import { PeopleAccessRequired } from "../_components/PeopleAccessRequired";
import { PeopleHeader } from "../_components/PeopleHeader";
import { hasPeopleAccess } from "../_lib/access-server";
import { SystemsClient } from "./SystemsClient";

export default async function SystemsPage() {
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
      <PeopleHeader crumb={[{ label: "Systems" }]} />
      <div className="mx-auto w-full max-w-[1860px] px-3 sm:px-5">
        <SystemsClient />
      </div>
    </div>
  );
}
