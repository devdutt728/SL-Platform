import Link from "next/link";
import { backendUrl } from "@/lib/backend";
import { OpeningPublicListItem } from "@/lib/types";
import { PublicOpeningsClient } from "./ui";

async function fetchPublicOpenings() {
  const res = await fetch(backendUrl("/apply"), { cache: "no-store" });
  if (!res.ok) return [] as OpeningPublicListItem[];
  return (await res.json()) as OpeningPublicListItem[];
}

export default async function PublicApplyIndexPage() {
  const openings = await fetchPublicOpenings();
  const visible = openings.filter((o) => o.is_active !== false);
  return (
    <main className="page-shell flex min-h-screen flex-col gap-4 py-10">
      <div className="section-card flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-tight text-[var(--text-secondary)]">Apply</p>
          <h1 className="mt-2 text-3xl font-semibold">Open roles</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Choose a role to apply.</p>
        </div>
        <Link href="/" className="rounded-xl border border-[var(--border)] bg-white/40 px-4 py-2 text-sm font-semibold">
          Home
        </Link>
      </div>

      <PublicOpeningsClient openings={visible} />
    </main>
  );
}
