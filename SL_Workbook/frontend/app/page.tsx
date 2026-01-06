const apps = [
  {
    label: "SERVICE OPS",
    title: "IT Helpdesk",
    description: "Tickets, assets, SLAs, and support operations.",
    href: "/it/login",
    accent: "from-cyan-500/30 to-blue-500/10",
    tags: ["Live Sync", "Encrypted access", "Audit-ready"],
    icon: <CircuitIcon />,
  },
  {
    label: "TALENT ENGINE",
    title: "Recruitment",
    description: "Candidates, pipelines, interviews, and offers.",
    href: "/recruitment/login",
    accent: "from-rose-500/30 to-orange-500/10",
    tags: ["Live Sync", "Encrypted access", "Audit-ready"],
    icon: <OrbitIcon />,
  },
];

export default function Home() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const logoSrc = `${basePath}/studio-lotus-logo.png`;

  return (
    <div className="page-shell min-h-screen py-16">
      <div className="max-w-5xl">
        <div className="flex flex-col gap-2">
          <div className="h-14 w-56">
            <img
              src={logoSrc}
              alt="Studio Lotus"
              className="h-full w-full object-contain"
              style={{ imageRendering: "auto" }}
            />
          </div>
          <div className="text-[0.6rem] font-semibold uppercase tracking-[0.4em] text-steel">
            Platform Workbook
          </div>
        </div>
        <h1 className="mt-8 text-4xl font-semibold text-slate-900 sm:text-5xl">
          Orchestrate every workspace from one console.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-steel">
          Choose a module to continue. Each app has its own sign-in and workspace, wired to the same platform identity.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {apps.map((app) => (
          <a key={app.title} href={app.href} className="section-card workbook-card group">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`workbook-icon flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${app.accent}`}>
                  {app.icon}
                </div>
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-steel">{app.label}</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">{app.title}</h2>
                </div>
              </div>
              <span className="workbook-open text-xs font-semibold text-steel">
                Open -&gt;
              </span>
            </div>
            <p className="mt-4 text-sm text-steel">{app.description}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {app.tags.map((tag) => (
                <span key={tag} className="workbook-chip text-xs font-semibold">
                  {tag}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-3 text-xs text-steel">
        <span className="workbook-chip">Zero-trust gateways enabled</span>
        <span>Need access? Contact your admin to enable your role in the sl_platform directory.</span>
      </div>
    </div>
  );
}

function CircuitIcon() {
  return (
    <svg
      className="h-5 w-5 text-slate-900"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 6h5m7 0h-2M6 12h12M6 18h2m6 0h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="6" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="12" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="18" r="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function OrbitIcon() {
  return (
    <svg
      className="h-5 w-5 text-slate-900"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4c3.3 0 6 3.6 6 8s-2.7 8-6 8-6-3.6-6-8 2.7-8 6-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 8c2.2-1.8 5.7-2.4 9.4-1.3 3.7 1.1 6.1 3.6 6.1 6.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="17.5" cy="13.5" r="1.5" fill="currentColor" />
    </svg>
  );
}
