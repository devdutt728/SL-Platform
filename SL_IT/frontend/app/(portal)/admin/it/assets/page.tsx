import { RoleGuard } from "@/components/role-guard";
import { ItAssetsAdmin } from "@/components/it-assets-admin";

export default function AdminItAssetsPage() {
  return (
    <RoleGuard allowed={["it_lead", "admin"]}>
      <ItAssetsAdmin />
    </RoleGuard>
  );
}

