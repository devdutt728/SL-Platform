import Image from "next/image";

export default function PublicPortalPage({ searchParams }: { searchParams?: { session?: string } }) {
  const logoSrc = "/studio-lotus-logo.png";
  const sessionExpired = searchParams?.session === "expired";

  return (
    <main className="page-shell min-h-screen py-10">
      {sessionExpired ? (
        <div className="mb-4 rounded-2xl border border-[#E74011]/30 bg-[#E74011]/10 px-4 py-3 text-sm text-[#5D5552]">
          Session expired. You have been signed out and redirected to the public portal.
        </div>
      ) : null}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-40">
            <Image src={logoSrc} alt="Studio Lotus" fill sizes="160px" className="object-contain" priority />
          </div>
          <span className="public-pill">Public portal</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a href="/recruitment/apply" className="public-button public-button--ghost">
            View openings
          </a>
          <a href="/login" className="public-button public-button--primary">
            Employee sign in
          </a>
        </div>
      </header>

      <section className="public-hero mt-12">
        <div className="public-hero__content">
          <p className="public-kicker">Studio Lotus Careers</p>
          <h1 className="public-hero__title">
            A future-forward workplace for people who design what is next.
          </h1>
          <p className="public-hero__copy">
            Explore openings, submit your application securely, and track every milestone through a trusted candidate portal.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/recruitment/apply" className="public-button public-button--primary">
              Explore openings
            </a>
            <a href="/recruitment/apply" className="public-button public-button--ghost">
              Apply with a code
            </a>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="public-pill">Secure candidate links</span>
            <span className="public-pill">Workspace-grade privacy</span>
            <span className="public-pill">Global delivery teams</span>
          </div>
        </div>
        <div className="public-hero__visual" aria-hidden="true">
          <div className="signal-grid" />
          <div className="signal-orbit" />
          <div className="signal-orbit signal-orbit--alt" />
          <div className="signal-line signal-line--a" />
          <div className="signal-line signal-line--b" />
          <div className="signal-core" />
        </div>
      </section>

      <section className="public-band mt-14">
        <div>
          <p className="public-kicker">Openings</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Ready to start?</h2>
          <p className="mt-3 text-sm text-slate-600">
            Browse open roles and submit a single, structured application. Every submission is reviewed by the hiring team.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href="/recruitment/apply" className="public-button public-button--primary">
            View roles
          </a>
          <a href="/recruitment/apply" className="public-button public-button--ghost">
            Apply now
          </a>
        </div>
      </section>
    </main>
  );
}
