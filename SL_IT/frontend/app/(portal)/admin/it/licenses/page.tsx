import { RoleGuard } from "@/components/role-guard";
import { ItLicensesAdmin } from "@/components/it-licenses-admin";

export default function AdminItLicensesPage() {
  return (
    <RoleGuard allowed={["it_lead", "admin"]}>
      <ItLicensesAdmin />
    </RoleGuard>
  );
}

