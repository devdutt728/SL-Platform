import Link from "next/link";

import { ItAdminSettings } from "@/components/it-admin-settings";
import { RoleGuard } from "@/components/role-guard";

export default function AdminItPage() {
  return (
    <div className="space-y-6">
      <section className="section-card">
        <h1 className="text-2xl font-semibold">IT Configuration</h1>
        <p className="mt-2 text-steel">Manage categories, subcategories, SLA policies, and routing rules.</p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/admin/it/assets" className="section-card">
          <h2 className="text-lg font-semibold">Assets</h2>
          <p className="mt-2 text-sm text-steel">Track hardware inventory and assignments.</p>
        </Link>
        <Link href="/admin/it/licenses" className="section-card">
          <h2 className="text-lg font-semibold">Licenses</h2>
          <p className="mt-2 text-sm text-steel">Track vendors, seats, renewals, and assignments.</p>
        </Link>
        <Link href="/admin/it/credentials" className="section-card">
          <h2 className="text-lg font-semibold">Credentials</h2>
          <p className="mt-2 text-sm text-steel">Encrypted license account storage.</p>
        </Link>
      </section>
      <RoleGuard allowed={["it_lead", "admin"]}>
        <section className="section-card">
          <ItAdminSettings />
        </section>
      </RoleGuard>
    </div>
  );
}
