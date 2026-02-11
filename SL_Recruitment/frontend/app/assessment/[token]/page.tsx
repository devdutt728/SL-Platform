import Image from "next/image";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { internalUrl } from "@/lib/internal";
import { CandidateAssessmentPrefill } from "@/lib/types";
import { AssessmentForm } from "./ui";

async function fetchPrefill(token: string) {
  const res = await fetch(await internalUrl(`/api/assessment/${token}`), { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as CandidateAssessmentPrefill;
}

function BackgroundLayer() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <div className="absolute inset-0 bg-[linear-gradient(96deg,rgba(255,255,255,0.96)_0%,rgba(231,64,17,0.09)_52%,rgba(255,255,255,0.96)_100%)]" />
      <div className="absolute inset-0 opacity-15 [background-image:linear-gradient(rgba(93,85,82,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(93,85,82,0.11)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="absolute -top-24 left-[2%] h-72 w-72 rounded-full bg-[var(--brand-color)]/14 blur-3xl" />
      <div className="absolute -right-20 top-[18%] h-72 w-72 rounded-full bg-[rgba(93,85,82,0.12)] blur-3xl" />
    </div>
  );
}

function TopBar({ logoSrc, shellClass }: { logoSrc: string; shellClass: string }) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-[var(--accessible-components--dark-grey)] bg-white/94 backdrop-blur-xl">
      <div className={`${shellClass} flex h-[68px] items-center justify-between gap-4`}>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-1.5 shadow-[var(--shadow-soft)]">
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
            <p className="text-[10px] uppercase tracking-[0.3em] text-[rgba(93,85,82,0.55)]">Candidate Portal</p>
            <p className="text-[13px] font-semibold text-[var(--dim-grey)]">Assessment form</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[var(--dim-grey)]">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--brand-color)]" />
            Secure
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--brand-color)]" />
            Candidate only
          </span>
        </div>
      </div>
    </header>
  );
}

export default async function AssessmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const logoSrc = `${basePath}/Studio Lotus Logo (TM).png`;
  const shellClass = "mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-7";
  const prefill = await fetchPrefill(token);

  if (!prefill) {
    return (
      <main className="apply-font-override relative isolate min-h-screen overflow-hidden bg-[var(--surface-base)] text-[var(--dim-grey)]">
        <BackgroundLayer />
        <TopBar logoSrc={logoSrc} shellClass={shellClass} />
        <div className={`${shellClass} relative z-10 pb-14 pt-24`}>
          <div className="rounded-[28px] border border-[var(--accessible-components--dark-grey)] bg-white p-7 shadow-[var(--shadow-soft)]">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">CAF</p>
            <h1 className="mt-2 text-xl font-semibold text-[var(--dim-grey)]">Invalid or expired link</h1>
            <p className="mt-2 max-w-2xl text-[13px] text-[var(--dim-grey)]">Please check the URL or contact HR.</p>
          </div>
        </div>
      </main>
    );
  }

  if (prefill.assessment_submitted_at) {
    return (
      <main className="apply-font-override relative isolate min-h-screen overflow-hidden bg-[var(--surface-base)] text-[var(--dim-grey)]">
        <BackgroundLayer />
        <TopBar logoSrc={logoSrc} shellClass={shellClass} />
        <div className={`${shellClass} relative z-10 pb-14 pt-24`}>
          <div className="rounded-[28px] border border-[var(--accessible-components--dark-grey)] bg-white p-7 shadow-[var(--shadow-soft)]">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Candidate Assessment Form</p>
            <h1 className="mt-2 text-xl font-semibold text-[var(--dim-grey)]">{prefill.opening_title || "Studio Lotus"}</h1>
            <p className="mt-2 max-w-2xl text-[13px] text-[var(--dim-grey)]">This assessment has already been submitted.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="apply-font-override relative isolate min-h-screen overflow-hidden bg-[var(--surface-base)] text-[var(--dim-grey)]">
      <BackgroundLayer />
      <TopBar logoSrc={logoSrc} shellClass={shellClass} />

      <div className={`${shellClass} relative z-10 pb-12 pt-24 text-[13px]`}>
        <div className="grid items-start gap-5 xl:grid-cols-[350px_minmax(0,1fr)]">
          <section className="hidden xl:block">
            <div className="sticky top-[88px] space-y-4 rounded-[28px] border border-[var(--accessible-components--dark-grey)] bg-white p-5 shadow-[var(--shadow-soft)]">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Role Overview</p>
                <p className="mt-2 text-lg font-semibold text-[var(--dim-grey)]">{prefill.opening_title || "Studio Lotus"}</p>
              </div>

              <div className="rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white p-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Candidate</p>
                <p className="mt-2 text-[13px] font-semibold text-[var(--dim-grey)]">{prefill.name}</p>
                <p className="mt-1 text-[12px] text-[var(--dim-grey)]">{prefill.email}</p>
                <p className="text-[12px] text-[var(--dim-grey)]">{prefill.phone || "—"}</p>
              </div>

              {prefill.opening_description ? (
                <div className="rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white p-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Role Description</p>
                  <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--dim-grey)]">
                    {prefill.opening_description}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="min-w-0 xl:max-w-[910px] xl:justify-self-end">
            <div className="xl:hidden">
              <div className="mb-4 rounded-[26px] border border-[var(--accessible-components--dark-grey)] bg-white p-5 shadow-[var(--shadow-soft)]">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Role Overview</p>
                <p className="mt-2 text-base font-semibold text-[var(--dim-grey)]">{prefill.opening_title || "Studio Lotus"}</p>
                <p className="mt-2 text-[12px] text-[var(--dim-grey)]">{prefill.name}</p>
              </div>
            </div>

            <div className="mb-4 rounded-[26px] border border-[var(--accessible-components--dark-grey)] bg-white p-5 shadow-[var(--shadow-soft)]">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Candidate Assessment Form (CAF)</p>
              <h1 className="mt-2 text-[22px] font-semibold text-[var(--dim-grey)]">{prefill.opening_title || "Studio Lotus"}</h1>
              <p className="mt-2 text-[13px] text-[var(--dim-grey)]">Please complete the form below to finish your application.</p>
            </div>

            <AssessmentForm token={token} prefill={prefill} />
          </section>
        </div>
      </div>
    </main>
  );
}
