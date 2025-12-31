import { internalUrl } from "@/lib/internal";
import { OpeningApplyPrefill } from "@/lib/types";
import { ApplyForm } from "./ui";
import Image from "next/image";
import { CheckCircle2, ShieldCheck } from "lucide-react";

async function fetchOpening(openingCode: string) {
  const res = await fetch(internalUrl(`/api/apply/${openingCode}`), { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as OpeningApplyPrefill;
}

export default async function ApplyPage({ params }: { params: { opening_code: string } }) {
  const opening = await fetchOpening(params.opening_code);

  if (!opening) {
    return (
      <main className="min-h-screen overflow-hidden">
        <header className="fixed left-0 right-0 top-0 z-20 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl">
          <div className="page-shell flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-36">
                <Image
                  src="/Studio Lotus Logo (TM).png"
                  alt="Studio Lotus"
                  fill
                  sizes="144px"
                  className="object-contain object-left"
                  priority
                />
              </div>
              <div className="hidden sm:block">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Application</p>
                <p className="text-[13px] font-semibold text-slate-900">Job not available</p>
              </div>
            </div>
          </div>
        </header>

        <div className="page-shell pt-24 pb-10">
          <div className="glass-panel p-6">
            <h1 className="text-xl font-semibold text-slate-900">Job not available</h1>
            <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
              This job is currently inactive or the link is no longer valid.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <header className="fixed left-0 right-0 top-0 z-20 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl">
        <div className="page-shell flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-36">
              <Image
                src="/Studio Lotus Logo (TM).png"
                alt="Studio Lotus"
                fill
                sizes="144px"
                className="object-contain object-left"
                priority
              />
            </div>
            <div className="hidden sm:block">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Application</p>
              <p className="text-[13px] font-semibold text-slate-900">{opening.opening_title || "Job opening"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-white/60 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Secure
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-white/60 px-3 py-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-violet-600" />
              One form
            </span>
            <span className="rounded-full border border-slate-200/60 bg-white/60 px-3 py-1">
              Code: <span className="font-semibold text-slate-800">{opening.opening_code}</span>
            </span>
          </div>
        </div>
      </header>

      <div className="page-shell pt-20 pb-8 text-[13px]">
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="hidden lg:block lg:col-span-2">
            <div className="glass-panel sticky top-24 space-y-4 p-6">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Role</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{opening.opening_title || "Job opening"}</p>
                <p className="mt-1 text-[13px] text-slate-600">
                  Apply with code <span className="font-semibold text-slate-900">{opening.opening_code}</span>
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Steps</p>
                <ol className="mt-3 space-y-2 text-[13px] text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">1</span>
                    <span>Basics + documents</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">2</span>
                    <span>Quick screening (CAF)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">3</span>
                    <span>Submit once</span>
                  </li>
                </ol>
              </div>

              {opening.opening_description ? (
                <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Role description</p>
                  <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{opening.opening_description}</p>
                </div>
              ) : null}

              <p className="text-[11px] leading-relaxed text-slate-500">
                We never share your details publicly. Submissions are reviewed by the hiring team only.
              </p>
            </div>
          </section>
          <section className="lg:col-span-3">
            <ApplyForm openingCode={opening.opening_code} />
          </section>
        </div>
      </div>
    </main>
  );
}
