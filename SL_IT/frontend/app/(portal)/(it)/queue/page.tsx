import { QueueTabs } from "@/components/queue-tabs";
import { RoleGuard } from "@/components/role-guard";

export default function QueuePage() {
  return (
    <div className="space-y-6">
      <section className="section-card">
        <h1 className="text-2xl font-semibold">IT Helpdesk Queue</h1>
        <p className="mt-2 text-steel">
          Manage assignments, prioritize SLAs, and keep requests moving.
        </p>
      </section>
      <RoleGuard allowed={["it_agent", "it_lead", "admin"]}>
        <section className="section-card">
          <QueueTabs />
        </section>
      </RoleGuard>
    </div>
  );
}
