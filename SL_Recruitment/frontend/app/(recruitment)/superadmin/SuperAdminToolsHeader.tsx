import Link from "next/link";

type SuperAdminTool = "ingest-ops" | "roles" | "people" | "sprint-templates" | "candidate-communications";

type Props = {
  active: SuperAdminTool;
};

const TOOL_LINKS: Array<{ key: SuperAdminTool; href: string; label: string }> = [
  { key: "ingest-ops", href: "/superadmin/ingest-ops", label: "Ingest Operations" },
  { key: "candidate-communications", href: "/superadmin/candidate-communications", label: "Candidate Communications" },
  { key: "roles", href: "/superadmin/roles", label: "Role Management" },
  { key: "people", href: "/superadmin/people", label: "People Management" },
  { key: "sprint-templates", href: "/superadmin/sprint-templates", label: "Sprint Templates" },
];

function toolClassName(isActive: boolean) {
  if (isActive) {
    return "rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-card hover:bg-slate-800";
  }
  return "rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50";
}

export function SuperAdminToolsHeader({ active }: Props) {
  return (
    <div className="content-pad">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">SuperAdmin tools</p>
          <p className="text-sm text-slate-600">Choose a function and run each workflow with dedicated controls.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {TOOL_LINKS.map((item) => (
            <Link key={item.key} href={item.href} className={toolClassName(active === item.key)}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
