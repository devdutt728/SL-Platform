import { RoleGuard } from "@/components/role-guard";
import { UserAdminTable } from "@/components/user-admin-table";

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <section className="section-card">
        <h1 className="text-2xl font-semibold">User Management</h1>
        <p className="mt-2 text-steel">
          Manage roles and access. The last active superadmin cannot be removed.
        </p>
      </section>
      <RoleGuard allowed={["admin"]}>
        <section className="section-card">
          <UserAdminTable />
        </section>
      </RoleGuard>
    </div>
  );
}
