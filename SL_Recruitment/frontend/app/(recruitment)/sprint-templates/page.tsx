import { backendUrl } from "@/lib/backend";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { SprintTemplate } from "@/lib/types";
import { SprintTemplatesClient } from "./SprintTemplatesClient";

async function fetchTemplates() {
  const res = await fetch(backendUrl("/rec/sprint-templates?include_inactive=1"), {
    cache: "no-store",
    headers: { ...await authHeaderFromCookie() },
  });
  if (!res.ok) return [];
  return (await res.json()) as SprintTemplate[];
}

export default async function SprintTemplatesPage() {
  const templates = await fetchTemplates();
  return <SprintTemplatesClient initialTemplates={templates} />;
}
