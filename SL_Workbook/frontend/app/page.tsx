const apps = [
  {
    title: "IT Helpdesk",
    description: "Tickets, assets, SLAs, and support operations.",
    href: "/it/login",
    accent: "from-cyan-500/15 to-blue-500/10",
    initials: "IT",
  },
  {
    title: "Recruitment",
    description: "Candidates, pipelines, interviews, and offers.",
    href: "/recruitment/login",
    accent: "from-rose-500/15 to-orange-500/10",
    initials: "RC",
  },
];

export default function Home() {
  return (
    <div className="page-shell min-h-screen py-16">
      <div className="max-w-4xl">
        <p className="text-xs uppercase tracking-[0.3em] text-steel">Studio Lotus</p>
        <h1 className="mt-4 text-4xl font-semibold text-slate-900">Studio Lotus Platform Workbook</h1>
        <p className="mt-4 text-base text-steel">
          Choose a module to continue. Each app has its own sign-in and workspace.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {apps.map((app) => (
          <a key={app.title} href={app.href} className="section-card group">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${app.accent}`}>
              <span className="text-sm font-semibold text-slate-900">{app.initials}</span>
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">{app.title}</h2>
                <span className="text-xs font-semibold text-steel group-hover:text-slate-900">
                  Open →
                </span>
              </div>
              <p className="mt-2 text-sm text-steel">{app.description}</p>
            </div>
          </a>
        ))}
      </div>

      <div className="mt-12 text-xs text-steel">
        Need access? Contact your admin to enable your role in the sl_platform directory.
      </div>
    </div>
  );
}
