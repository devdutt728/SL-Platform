import { backendUrl } from "@/lib/backend";
import { OpeningApplyPrefill } from "@/lib/types";
import { ApplyForm } from "./ui";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

async function fetchOpening(openingCode: string) {
  const url = backendUrl(`/apply/${openingCode}`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as OpeningApplyPrefill;
}

function BackgroundLayer() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <div className="absolute inset-0 bg-[linear-gradient(92deg,rgba(19,120,209,0.16)_0%,rgba(255,255,255,0.9)_50%,rgba(231,64,17,0.12)_100%)]" />
      <div className="absolute inset-0 opacity-15 [background-image:linear-gradient(rgba(93,85,82,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(93,85,82,0.11)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="absolute -top-24 left-[-10%] h-72 w-72 rounded-full bg-[var(--accessible-components--dodger-blue)]/20 blur-3xl" />
      <div className="absolute -right-20 top-[14%] h-72 w-72 rounded-full bg-[var(--brand-color)]/18 blur-3xl" />
    </div>
  );
}

function TopBar({
  logoSrc,
  title,
  code,
  shellClass,
  backHref,
}: {
  logoSrc: string;
  title: string;
  code: string;
  shellClass: string;
  backHref: string;
}) {
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
            <p className="text-[10px] uppercase tracking-[0.3em] text-[rgba(93,85,82,0.55)]">Application Grid</p>
            <p className="text-[13px] font-semibold text-[var(--dim-grey)]">{title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[var(--dim-grey)]">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-1 transition hover:bg-[var(--surface-card)]"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-[var(--accessible-components--dodger-blue)]" />
            Back
          </Link>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--accessible-components--dodger-blue)]" />
            Secure
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accessible-components--dodger-blue)]" />
            One form
          </span>
          <span className="rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-1">
            Code: <span className="font-semibold text-[var(--dim-grey)]">{code}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

export default async function ApplyPage({ params }: { params: Promise<{ opening_code: string }> }) {
  const { opening_code } = await params;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const backHref = "/apply";
  const logoSrc = `${basePath}/Studio Lotus Logo (TM).png`;
  const opening = await fetchOpening(opening_code);
  const shellClass = "mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-7";

  if (!opening) {
    return (
      <main className="apply-font-override relative isolate min-h-screen overflow-hidden bg-[var(--surface-base)] text-[var(--dim-grey)]">
        <BackgroundLayer />
        <TopBar
          logoSrc={logoSrc}
          title="Job not available"
          code={opening_code}
          shellClass={shellClass}
          backHref={backHref}
        />
        <div className={`${shellClass} relative z-10 pb-14 pt-24`}>
          <div className="rounded-[28px] border border-[var(--accessible-components--dark-grey)] bg-white p-7 shadow-[var(--shadow-soft)]">
            <h1 className="text-xl font-semibold text-[var(--dim-grey)]">Job not available</h1>
            <p className="mt-2 max-w-2xl text-[13px] text-[var(--dim-grey)]">
              This job is currently inactive or the link is no longer valid. Please reach out to the hiring team if you
              believe this is a mistake.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="apply-font-override relative isolate min-h-screen overflow-hidden bg-[var(--surface-base)] text-[var(--dim-grey)]">
      <BackgroundLayer />
      <TopBar
        logoSrc={logoSrc}
        title={opening.opening_title || "Job opening"}
        code={opening.opening_code}
        shellClass={shellClass}
        backHref={backHref}
      />

      <div className={`${shellClass} relative z-10 pb-12 pt-24 text-[13px]`}>
        <div className="grid items-start gap-5 xl:grid-cols-[350px_minmax(0,1fr)]">
          <section className="hidden xl:block">
            <div className="sticky top-[88px] space-y-4 rounded-[28px] border border-[var(--accessible-components--dark-grey)] bg-white p-5 shadow-[var(--shadow-soft)]">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Role Overview</p>
                <p className="mt-2 text-lg font-semibold text-[var(--dim-grey)]">{opening.opening_title || "Job opening"}</p>
                <p className="mt-2 text-[13px] text-[var(--dim-grey)]">
                  Apply with code <span className="font-semibold text-[var(--dim-grey)]">{opening.opening_code}</span>
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white p-4">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">
                  <Sparkles className="h-4 w-4 text-[var(--brand-color)]" />
                  Intake Flow
                </div>
                <div className="mt-3 space-y-2.5">
                  <div className="rounded-2xl border border-[rgba(231,64,17,0.3)] bg-[linear-gradient(90deg,rgba(231,64,17,0.1),rgba(255,255,255,1))] p-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-color)]/15 text-[11px] font-semibold text-[var(--brand-color)]">
                        01
                      </span>
                      <div>
                        <p className="text-[12px] font-semibold text-[var(--dim-grey)]">Basics + documents</p>
                        <p className="text-[11px] text-[var(--dim-grey)]">Share essentials and files</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[rgba(19,120,209,0.35)] bg-[linear-gradient(90deg,rgba(19,120,209,0.1),rgba(255,255,255,1))] p-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accessible-components--dodger-blue)]/14 text-[11px] font-semibold text-[var(--accessible-components--dodger-blue)]">
                        02
                      </span>
                      <div>
                        <p className="text-[12px] font-semibold text-[var(--dim-grey)]">Quick screening (CAF)</p>
                        <p className="text-[11px] text-[var(--dim-grey)]">Short form after review</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white p-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(93,85,82,0.12)] text-[11px] font-semibold text-[var(--dim-grey)]">
                        03
                      </span>
                      <div>
                        <p className="text-[12px] font-semibold text-[var(--dim-grey)]">Submit once</p>
                        <p className="text-[11px] text-[var(--dim-grey)]">Single profile for the full pipeline</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {opening.opening_description ? (
                <div className="rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white p-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Role Description</p>
                  <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--dim-grey)]">
                    {opening.opening_description}
                  </p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-white p-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Privacy</p>
                <p className="mt-2 text-[12px] text-[var(--dim-grey)]">
                  We never share your details publicly. Submissions are reviewed only by the hiring team.
                </p>
              </div>
            </div>
          </section>

          <section className="min-w-0 xl:max-w-[910px] xl:justify-self-end">
            <div className="xl:hidden">
              <div className="mb-4 rounded-[26px] border border-[var(--accessible-components--dark-grey)] bg-white p-5 shadow-[var(--shadow-soft)]">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Role Overview</p>
                <p className="mt-2 text-base font-semibold text-[var(--dim-grey)]">{opening.opening_title || "Job opening"}</p>
                <p className="mt-2 text-[12px] text-[var(--dim-grey)]">
                  Apply with code <span className="font-semibold text-[var(--dim-grey)]">{opening.opening_code}</span>
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
