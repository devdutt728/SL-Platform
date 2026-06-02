import { backendUrl } from "@/lib/backend";
import { OpeningApplyPrefill } from "@/lib/types";
import { visibleRecordOrNull } from "@/lib/recruitment-visibility";
import { ApplyForm } from "./ui";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

async function fetchOpening(openingCode: string) {
  const url = backendUrl(`/apply/${openingCode}`);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const payload = (await res.json()) as OpeningApplyPrefill;
    return visibleRecordOrNull(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Public opening fetch failed for ${openingCode}: ${message}`);
    return null;
  }
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
          <Link href="/" aria-label="Studio Lotus home" className="rounded-xl border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-1.5 shadow-[var(--shadow-soft)]">
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
          </Link>
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
  const logoSrc = `${basePath}/Studio Lotus Logo (TM).png`;
  const opening = await fetchOpening(opening_code);
  const backHref = "/apply";
  const shellClass = "mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-8";
  const jdBaseHref = opening ? `${basePath}/api/apply/${encodeURIComponent(opening.opening_code)}/jd` : null;

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

      <div className={`${shellClass} relative z-10 pb-4 pt-24 text-[13px] xl:h-[calc(100vh-84px)] xl:pb-6`}>
        <div className="xl:grid xl:h-full xl:grid-cols-[390px_minmax(0,1fr)] xl:gap-5 2xl:grid-cols-[400px_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col">
            <div className="mb-4 rounded-[26px] border border-[var(--accessible-components--dark-grey)] bg-white/95 p-4 shadow-[var(--shadow-soft)] backdrop-blur xl:hidden">
              <p className="text-[10px] uppercase tracking-[0.34em] text-[var(--light-grey)]">Candidate Intake Console</p>
              <p className="mt-2 text-[22px] font-semibold leading-tight text-[var(--dim-grey)]">
                {opening.opening_title || "Job opening"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-full border border-[var(--accessible-components--dark-grey)] bg-[rgba(19,120,209,0.08)] px-3 py-1 font-semibold text-[var(--accessible-components--dodger-blue)]">
                  Code: {opening.opening_code}
                </span>
                <span className="rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-3 py-1 font-medium text-[var(--dim-grey)]">
                  {[opening.location_city, opening.location_country].filter(Boolean).join(", ") || "India"}
                </span>
              </div>
            </div>

            <ApplyForm openingCode={opening.opening_code} compact />
          </section>

          <section className="mt-5 min-w-0 xl:mt-0 xl:min-h-0">
            {opening.jd_available ? (
              <div className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-[30px] border border-[var(--accessible-components--dark-grey)] bg-white shadow-[var(--shadow-soft)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--accessible-components--dark-grey)] px-5 py-4 sm:px-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">JD Preview</p>
                    <p className="mt-1 text-[12px] text-[var(--dim-grey)]">
                      {opening.opening_title || "Job opening"} · {opening.jd_display_name || "PDF"} with browser zoom, print, and save controls.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={jdBaseHref || "#"}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center rounded-full border border-[var(--accessible-components--dark-grey)] bg-white px-4 py-2 text-[11px] font-semibold text-[var(--dim-grey)] transition hover:bg-[var(--surface-card)]"
                    >
                      Open in tab
                    </a>
                    <a
                      href={jdBaseHref ? `${jdBaseHref}?download=1` : "#"}
                      className="inline-flex items-center rounded-full bg-[var(--dim-grey)] px-4 py-2 text-[11px] font-semibold text-white transition hover:opacity-90"
                    >
                      Download PDF
                    </a>
                  </div>
                </div>
                <iframe
                  src={jdBaseHref || undefined}
                  title={`${opening.opening_title || "Job opening"} job description`}
                  className="h-[66vh] min-h-[520px] w-full bg-white xl:h-auto xl:min-h-0 xl:flex-1"
                />
              </div>
            ) : (
              <div className="rounded-[30px] border border-[var(--accessible-components--dark-grey)] bg-white p-6 shadow-[var(--shadow-soft)] xl:flex xl:h-full xl:flex-col xl:justify-center">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">JD Preview</p>
                <p className="mt-2 text-[16px] font-semibold text-[var(--dim-grey)]">JD preview is not linked for this opening yet</p>
                <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[var(--dim-grey)]">
                  You can still complete the application from the compact intake console on the left.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
