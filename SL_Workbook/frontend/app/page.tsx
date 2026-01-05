const apps = [
  {
    title: "IT Helpdesk",
    description: "Tickets, assets, SLAs, and support operations.",
    href: "/it/login",
    accent: "from-cyan-400/20 via-sky-300/10 to-indigo-400/15",
    meta: "Service Ops",
    icon: ShieldIcon,
  },
  {
    title: "Recruitment",
    description: "Candidates, pipelines, interviews, and offers.",
    href: "/recruitment/login",
    accent: "from-rose-400/20 via-pink-300/10 to-amber-300/15",
    meta: "Talent Engine",
    icon: OrbitIcon,
  },
];

export default function Home() {
  return (
    <div className="page-shell min-h-screen py-14">
      <div className="flex flex-col items-start gap-6">
        <div className="inline-flex flex-col items-start gap-2 px-4 py-2">
          <div className="flex h-12 w-48 items-center justify-center rounded-full bg-white/95 ring-1 ring-white/80">
            <img src="/studio-lotus-logo.png" alt="Studio Lotus" className="h-8 w-40 object-contain" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-steel">Platform Workbook</p>
        </div>

        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
            Orchestrate every workspace from one console.
          </h1>
          <p className="mt-4 text-base text-steel md:text-lg">
            Choose a module to continue. Each app has its own sign-in and workspace, wired to the same platform
            identity.
          </p>
        </div>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {apps.map((app, index) => (
          <a
            key={app.title}
            href={app.href}
            className="section-card group relative overflow-hidden motion-fade-up"
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <div className="pointer-events-none absolute inset-0">
              <div className={`absolute -left-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br ${app.accent} blur-2xl`} />
              <div className="absolute -bottom-16 -right-16 h-36 w-36 rounded-full bg-white/60 blur-3xl" />
            </div>

            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 shadow-[0_12px_30px_-20px_rgba(15,23,42,0.6)]">
                    <app.icon className="h-6 w-6 text-slate-900" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-steel">{app.meta}</p>
                    <h2 className="text-xl font-semibold text-slate-900">{app.title}</h2>
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-steel transition group-hover:text-slate-900">
                  Open <ArrowIcon className="h-3 w-3" />
                </span>
              </div>

              <p className="mt-4 text-sm text-steel">{app.description}</p>

              <div className="mt-6 flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-900">
                  Live Sync <PulseDot />
                </span>
                <span className="text-xs text-steel">Encrypted access | Audit-ready</span>
              </div>
            </div>
          </a>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-4 text-xs text-steel">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1">
          <SignalIcon className="h-3 w-3" />
          Zero-trust gateways enabled
        </span>
        <span>Need access? Contact your admin to enable your role in the sl_platform directory.</span>
      </div>
    </div>
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

function PulseDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}

function ShieldIcon({ className }: { className?: string }) {
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
      <path d="M12 3l7 3v5c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6l7-3z" />
      <path d="M9.2 12.2l2 2.1 3.6-4" />
    </svg>
  );
}

function OrbitIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="3.5" />
      <path d="M3 12c0-4.5 4-8 9-8s9 3.5 9 8-4 8-9 8-9-3.5-9-8z" opacity="0.6" />
      <path d="M12 2c3.8 1.8 6 5.5 6 10s-2.2 8.2-6 10c-3.8-1.8-6-5.5-6-10s2.2-8.2 6-10z" />
    </svg>
  );
}

function SignalIcon({ className }: { className?: string }) {
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
      <path d="M4 12a8 8 0 0 1 16 0" />
      <path d="M7 12a5 5 0 0 1 10 0" />
      <path d="M10 12a2 2 0 0 1 4 0" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
