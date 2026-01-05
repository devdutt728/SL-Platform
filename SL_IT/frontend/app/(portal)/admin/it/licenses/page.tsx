import { ItLicensesAdmin } from "@/components/it-licenses-admin";
import { RoleGuard } from "@/components/role-guard";

export default function AdminLicensesPage() {
  return (
    <div className="space-y-6">
      <section className="section-card">
        <h1 className="text-2xl font-semibold">Software Licenses</h1>
        <p className="mt-2 text-steel">Track vendors, seats, renewals, and assignments.</p>
      </section>
      <RoleGuard allowed={["it_lead", "admin"]}>
        <ItLicensesAdmin />
      </RoleGuard>
    </div>
  );
}
