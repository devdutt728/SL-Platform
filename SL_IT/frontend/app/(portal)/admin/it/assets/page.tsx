import { ItAssetsAdmin } from "@/components/it-assets-admin";
import { RoleGuard } from "@/components/role-guard";

export default function AdminAssetsPage() {
  return (
    <div className="space-y-6">
      <section className="section-card">
        <h1 className="text-2xl font-semibold">IT Assets</h1>
        <p className="mt-2 text-steel">Track hardware inventory, ownership, and lifecycle status.</p>
      </section>
      <RoleGuard allowed={["it_lead", "admin"]}>
        <ItAssetsAdmin />
      </RoleGuard>
    </div>
  );
}
