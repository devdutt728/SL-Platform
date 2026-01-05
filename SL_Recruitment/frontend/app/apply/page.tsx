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
    <main
      className="page-shell relative flex min-h-screen flex-col gap-6 overflow-hidden py-12"
      style={{ fontFamily: "\"Space Grotesk\", \"Trebuchet MS\", sans-serif" }}
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-20%] top-[-30%] h-[60vh] w-[60vh] rounded-full bg-[radial-gradient(circle_at_center,rgba(12,74,110,0.22),rgba(12,74,110,0))]" />
        <div className="absolute right-[-15%] top-[5%] h-[55vh] w-[55vh] rounded-full bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.20),rgba(250,204,21,0))]" />
        <div className="absolute bottom-[-25%] left-[20%] h-[60vh] w-[60vh] rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16),rgba(56,189,248,0))]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.65),rgba(255,255,255,0.4))]" />
      </div>

      <section className="relative overflow-hidden rounded-[28px] border border-white/40 bg-white/60 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Apply</p>
            <h1 className="mt-3 text-4xl font-semibold text-slate-900 sm:text-5xl">
              Open roles, reimagined.
            </h1>
            <p className="mt-3 text-sm text-slate-600 sm:text-base">
              Explore roles that blend craft, technology, and impact. Apply in minutes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-white/40 bg-slate-900 px-4 py-3 text-white">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Open roles</p>
              <p className="mt-1 text-2xl font-semibold">{visible.length}</p>
            </div>
            <Link
              href="/"
              className="rounded-2xl border border-slate-300/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-800 shadow-[0_10px_30px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.18)]"
            >
              Home
            </Link>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          {["Design", "Engineering", "Strategy", "Operations"].map((pill) => (
            <span
              key={pill}
              className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-600 shadow-sm"
            >
              {pill}
            </span>
          ))}
        </div>
      </section>

      <PublicOpeningsClient openings={visible} />
    </main>
  );
}
