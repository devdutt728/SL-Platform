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
    <main className="page-shell flex min-h-screen flex-col gap-6 py-10">
      <section className="section-card relative overflow-hidden">
        <div className="absolute -right-10 top-6 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl motion-float-slow" />
        <div className="absolute -left-6 bottom-4 h-32 w-32 rounded-full bg-rose-400/20 blur-3xl motion-float" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Apply
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </div>
            <h1 className="mt-4 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
              Future-ready roles for people who build what is next.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Explore Studio Lotus openings and apply with confidence. Every listing is curated for impact,
              mentorship, and long-term growth.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
              <span className="rounded-full border border-white/70 bg-white/60 px-3 py-1">AI-augmented hiring</span>
              <span className="rounded-full border border-white/70 bg-white/60 px-3 py-1">Transparent stages</span>
              <span className="rounded-full border border-white/70 bg-white/60 px-3 py-1">Human-first culture</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-2xl border border-white/70 bg-white/60 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-white hover:bg-white"
            >
              Home
            </Link>
            <div className="hidden rounded-2xl border border-white/60 bg-gradient-to-br from-white/60 to-white/30 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm md:block">
              {visible.length} roles live
            </div>
          </div>
        </div>
      </section>

      <PublicOpeningsClient openings={visible} />
    </main>
  );
}
