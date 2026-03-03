import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import type { SprintTemplate } from "@/lib/types";
import { SprintTemplatesClient } from "../../sprint-templates/SprintTemplatesClient";
import { SuperAdminToolsHeader } from "../SuperAdminToolsHeader";
import { requireSuperadminAccess } from "../server";

async function fetchTemplates() {
  const res = await fetch(backendUrl("/rec/sprint-templates?include_inactive=1"), {
    cache: "no-store",
    headers: { ...(await authHeaderFromCookie()) },
  });
  if (!res.ok) return [] as SprintTemplate[];
  return (await res.json()) as SprintTemplate[];
}

export default async function SuperAdminSprintTemplatesPage() {
  await requireSuperadminAccess();
  const templates = await fetchTemplates();

  return (
    <>
      <SuperAdminToolsHeader active="sprint-templates" />
      <SprintTemplatesClient initialTemplates={templates} initialIsSuperadmin />
    </>
  );
}
