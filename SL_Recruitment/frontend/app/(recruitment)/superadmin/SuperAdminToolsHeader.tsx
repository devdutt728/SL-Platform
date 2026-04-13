import Link from "next/link";

type SuperAdminTool =
  | "ingest-ops"
  | "roles"
  | "reports-access"
  | "people"
  | "sprint-templates"
  | "candidate-communications";

type Props = {
  active: SuperAdminTool;
};

const TOOL_LINKS: Array<{ key: SuperAdminTool; href: string; label: string }> = [
  { key: "ingest-ops", href: "/superadmin/ingest-ops", label: "Ingest Operations" },
  { key: "candidate-communications", href: "/superadmin/candidate-communications", label: "Candidate Communications" },
  { key: "roles", href: "/superadmin/roles", label: "Role Management" },
  { key: "reports-access", href: "/superadmin/reports-access", label: "App Access" },
  { key: "people", href: "/superadmin/people", label: "People Management" },
  { key: "sprint-templates", href: "/superadmin/sprint-templates", label: "Sprint Templates" },
];

function toolClassName(isActive: boolean) {
  if (isActive) {
    return "inline-flex items-center rounded-full border border-slate-900/70 bg-slate-900 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_12px_22px_-16px_rgba(15,23,42,0.8)]";
  }
  return "inline-flex items-center rounded-full border border-slate-200/80 bg-white/85 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-800";
}

export function SuperAdminToolsHeader({ active }: Props) {
  return (
    <div className="content-pad superadmin-shell">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-100/80 p-4 shadow-[0_22px_40px_-34px_rgba(15,23,42,0.55)]">
        <div className="pointer-events-none absolute -right-16 top-0 h-32 w-32 rounded-full bg-amber-200/35 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-12 bottom-0 h-24 w-24 rounded-full bg-cyan-200/30 blur-2xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">SuperAdmin Command Deck</p>
            <p className="text-sm text-slate-600">Run compact workflows for ingest, access, people, and templates.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {TOOL_LINKS.map((item) => (
              <Link key={item.key} href={item.href} className={toolClassName(active === item.key)}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
