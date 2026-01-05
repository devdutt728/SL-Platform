import Link from "next/link";

export default function HomePage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const logoSrc = `${basePath}/studio-lotus-logo.png`;
  const portalOrigin = process.env.NEXT_PUBLIC_PORTAL_ORIGIN || "";
  const workbookHref = portalOrigin ? `${portalOrigin}/` : "/";
  if (process.env.NEXT_PUBLIC_AUTH_MODE === "google") {
    // Still show the homepage for public /apply links; keep /recruitment gated by middleware.
  }

  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12">
      <div className="section-card max-w-xl text-center">
        <div className="mx-auto inline-flex flex-col items-center gap-3">
          <div className="flex h-12 w-44 items-center justify-center rounded-full bg-white/90 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.5)]">
            <img src={logoSrc} alt="Studio Lotus" className="h-8 w-36 object-contain" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Recruitment OS</p>
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">Welcome to the hiring OS</h1>
        <p className="mt-4 text-slate-600">Sign in to access the recruitment workspace.</p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02]"
          >
            Sign in
            <ArrowIcon className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/apply"
            className="rounded-full border border-white/60 bg-white/50 px-5 py-2.5 text-sm font-semibold text-slate-800 backdrop-blur transition hover:bg-white/70"
          >
            Apply to a role
          </Link>
        </div>
        <div className="mt-4 flex justify-center">
          <a
            href={workbookHref}
            className="group relative inline-flex w-[320px] items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-slate-900 transition"
          >
            <span className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-200 via-sky-100 to-indigo-200 opacity-80 blur-sm transition group-hover:opacity-100" />
            <span className="absolute inset-[1px] rounded-full bg-white/70 ring-1 ring-white/60" />
            <span className="relative flex items-center gap-2">
              Open Workbook
              <span className="text-xs opacity-70">→</span>
            </span>
          </a>
        </div>
      </div>
    </main>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}
