import { PlannerShell } from "@/components/planner-shell";
import { requirePlannerAccess } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const me = await requirePlannerAccess();
  return <PlannerShell initialMe={me} />;
}
