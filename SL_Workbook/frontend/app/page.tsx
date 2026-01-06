const apps = [
  {
    label: "SERVICE OPS",
    title: "IT Helpdesk",
    description: "Tickets, assets, SLAs, and support operations.",
    href: "/it/login",
    accent: "from-cyan-500/20 to-blue-500/10",
    tags: ["Live Sync", "Encrypted access", "Audit-ready"],
  },
  {
    label: "TALENT ENGINE",
    title: "Recruitment",
    description: "Candidates, pipelines, interviews, and offers.",
    href: "/recruitment/login",
    accent: "from-rose-500/20 to-orange-500/10",
    tags: ["Live Sync", "Encrypted access", "Audit-ready"],
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
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${app.accent}`}>
                  <span className="text-xs font-semibold text-slate-900">{app.title.slice(0, 2).toUpperCase()}</span>
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
