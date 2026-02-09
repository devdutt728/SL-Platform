import { backendUrl } from "@/lib/backend";
import { OpeningApplyPrefill } from "@/lib/types";
import { ApplyForm } from "./ui";
import Image from "next/image";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

async function fetchOpening(openingCode: string) {
  const url = backendUrl(`/apply/${openingCode}`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as OpeningApplyPrefill;
}

export default async function ApplyPage({ params }: { params: Promise<{ opening_code: string }> }) {
  const { opening_code } = await params;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const logoSrc = `${basePath}/Studio Lotus Logo (TM).png`;
  const opening = await fetchOpening(opening_code);

  if (!opening) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_46%),radial-gradient(circle_at_18%_70%,_rgba(14,116,144,0.1),_transparent_50%),radial-gradient(circle_at_80%_80%,_rgba(16,185,129,0.1),_transparent_52%)]" />
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:28px_28px]" />
        </div>

        <header className="fixed left-0 right-0 top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-2xl">
          <div className="page-shell flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white px-3 py-2 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.5)]">
                <div className="relative h-7 w-28">
                  <Image
                    src={logoSrc}
                    alt="Studio Lotus"
                    fill
                    sizes="112px"
                    className="object-contain object-left"
                    priority
                    unoptimized
                  />
                </div>
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-700/70">Application</p>
                <p className="text-[13px] font-semibold text-slate-900">Job not available</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Secure
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200/70 bg-cyan-50 px-3 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-cyan-600" />
                One form
              </span>
              <span className="rounded-full border border-slate-200/70 bg-white px-3 py-1">
                Code: <span className="font-semibold text-slate-900">{opening_code}</span>
              </span>
            </div>
          </div>
        </header>

        <div className="page-shell pt-24 pb-10">
          <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_30px_80px_-60px_rgba(15,23,42,0.4)] backdrop-blur-xl">
            <h1 className="text-xl font-semibold text-slate-900">Job not available</h1>
            <p className="mt-2 text-[13px] text-slate-600">
              This job is currently inactive or the link is no longer valid. Please reach out to the hiring team if you
              believe this is a mistake.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_46%),radial-gradient(circle_at_18%_70%,_rgba(14,116,144,0.1),_transparent_50%),radial-gradient(circle_at_80%_80%,_rgba(16,185,129,0.1),_transparent_52%)]" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="absolute -top-48 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute -bottom-56 right-10 h-[26rem] w-[26rem] rounded-full bg-emerald-400/15 blur-3xl" />
      </div>

      <header className="fixed left-0 right-0 top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-2xl">
        <div className="page-shell flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white px-3 py-2 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.5)]">
              <div className="relative h-7 w-28">
                <Image
                  src={logoSrc}
                  alt="Studio Lotus"
                  fill
                  sizes="112px"
                  className="object-contain object-left"
                  priority
                  unoptimized
                />
              </div>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-700/70">Application</p>
              <p className="text-[13px] font-semibold text-slate-900">{opening.opening_title || "Job opening"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Secure
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200/70 bg-cyan-50 px-3 py-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-cyan-600" />
              One form
            </span>
            <span className="rounded-full border border-slate-200/70 bg-white px-3 py-1">
              Code: <span className="font-semibold text-slate-900">{opening.opening_code}</span>
            </span>
          </div>
        </div>
      </header>

      <div className="page-shell pt-24 pb-12 text-[13px]">
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="hidden lg:block lg:col-span-2">
            <div className="sticky top-24 space-y-4 rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.35)] backdrop-blur-xl">
              <div>
                <p className="text-[10px] uppercase tracking-[0.4em] text-cyan-700/70">Role</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{opening.opening_title || "Job opening"}</p>
                <p className="mt-2 text-[13px] text-slate-600">
                  Apply with code <span className="font-semibold text-slate-900">{opening.opening_code}</span>
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-200/70 bg-cyan-50/70 p-4">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] text-cyan-700/80">
                  <Sparkles className="h-4 w-4 text-cyan-600" />
                  Intake flow
                </div>
                <div className="mt-3 space-y-3">
                  <div className="stage-rail rounded-2xl p-3">
                    <div className="flex items-center gap-3">
                      <span className="stage-node-active inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-semibold text-cyan-700">
                        1
                      </span>
                      <div>
                        <p className="text-[12px] font-semibold text-slate-900">Basics + documents</p>
                        <p className="text-[11px] text-slate-500">Share essentials and files</p>
                      </div>
                    </div>
                  </div>
                  <div className="stage-rail rounded-2xl p-3">
                    <div className="flex items-center gap-3">
                      <span className="stage-node-active stage-node-stagger-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-semibold text-cyan-700">
                        2
                      </span>
                      <div>
                        <p className="text-[12px] font-semibold text-slate-900">Quick screening (CAF)</p>
                        <p className="text-[11px] text-slate-500">Short form after review</p>
                      </div>
                    </div>
                  </div>
                  <div className="stage-rail rounded-2xl p-3">
                    <div className="flex items-center gap-3">
                      <span className="stage-node-active stage-node-stagger-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-semibold text-cyan-700">
                        3
                      </span>
                      <div>
                        <p className="text-[12px] font-semibold text-slate-900">Submit once</p>
                        <p className="text-[11px] text-slate-500">We will use this profile</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {opening.opening_description ? (
                <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4">
                  <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Role description</p>
                  <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
                    {opening.opening_description}
                  </p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4">
                <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Privacy</p>
                <p className="mt-2 text-[12px] text-slate-600">
                  We never share your details publicly. Submissions are reviewed only by the hiring team.
                </p>
              </div>
            </div>
          </section>

          <section className="lg:col-span-3">
            <div className="lg:hidden">
              <div className="mb-6 rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-[0_24px_60px_-50px_rgba(15,23,42,0.35)] backdrop-blur-xl">
                <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-700/70">Role</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{opening.opening_title || "Job opening"}</p>
                <p className="mt-2 text-[12px] text-slate-600">
                  Apply with code <span className="font-semibold text-slate-900">{opening.opening_code}</span>
                </p>
              </div>
            </div>
            <ApplyForm openingCode={opening.opening_code} />
          </section>
        </div>
      </div>
    </main>
  );
}
