import Link from "next/link";
import Image from "next/image";
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
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const logoSrc = `${basePath}/Studio Lotus Logo (TM).png`;

  return (
    <main className="page-shell flex min-h-screen flex-col gap-8 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative h-9 w-36">
            <Image src={logoSrc} alt="Studio Lotus" fill sizes="144px" className="object-contain" unoptimized />
          </div>
          <span className="rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">
            Careers
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Link
            href="/"
            className="rounded-full border border-slate-200/70 bg-white/70 px-4 py-2 font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
          >
            Overview
          </Link>
          <Link
            href="/apply"
            className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5"
          >
            All openings
          </Link>
        </div>
      </header>

      <section className="section-card relative overflow-hidden">
        <div className="absolute -right-10 top-6 h-44 w-44 rounded-full bg-cyan-400/20 blur-3xl motion-float-slow" />
        <div className="absolute -left-6 bottom-4 h-36 w-36 rounded-full bg-emerald-400/15 blur-3xl motion-float" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Open roles
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </div>
            <h1 className="mt-4 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
              Build the next generation of spaces with Studio Lotus.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Every role is crafted for impact, mentorship, and long-term growth. Submit once, track every stage, and
              stay informed.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
              <span className="rounded-full border border-white/70 bg-white/60 px-3 py-1">Secure candidate links</span>
              <span className="rounded-full border border-white/70 bg-white/60 px-3 py-1">Structured evaluation</span>
              <span className="rounded-full border border-white/70 bg-white/60 px-3 py-1">Human-first culture</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded-2xl border border-white/60 bg-gradient-to-br from-white/70 to-white/40 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm md:block">
              {visible.length} roles live
            </div>
          </div>
        </div>
      </section>

      <PublicOpeningsClient openings={visible} />
    </main>
  );
}
