import { ItCredentialsAdmin } from "@/components/it-credentials-admin";
import { RoleGuard } from "@/components/role-guard";

export default function AdminCredentialsPage() {
  return (
    <div className="space-y-6">
      <section className="section-card">
        <h1 className="text-2xl font-semibold">License Credentials</h1>
        <p className="mt-2 text-steel">Store encrypted credentials and link them to licenses.</p>
      </section>
      <RoleGuard allowed={["admin"]}>
        <ItCredentialsAdmin />
      </RoleGuard>
    </div>
  );
}
