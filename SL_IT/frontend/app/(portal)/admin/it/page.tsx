import { ItAdminSettings } from "@/components/it-admin-settings";
import { RoleGuard } from "@/components/role-guard";

export default function AdminItPage() {
  return (
    <div className="space-y-6">
      <section className="section-card">
        <h1 className="text-2xl font-semibold">IT Configuration</h1>
        <p className="mt-2 text-steel">Manage categories, subcategories, SLA policies, and routing rules.</p>
      </section>
      <RoleGuard allowed={["it_lead", "admin"]}>
        <section className="section-card">
          <ItAdminSettings />
        </section>
      </RoleGuard>
    </div>
  );
}
