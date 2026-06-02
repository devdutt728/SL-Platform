import Image from "next/image";

// Phase 0 stub. The People / Operating Console pages (org chart, employees,
// licenses, systems, peripherals, groups, import, access) are built in later
// phases inside this same /people/* route tree. Auth is enforced by proxy.ts
// (slp_token); this page renders the planned module map so the route resolves
// and the hub card has a destination.

const modules = [
  { title: "People / Org", desc: "Group-based org chart with drag-drop moves and a draft/publish system." },
  { title: "Employees", desc: "Directory + 6-tab profile with inline edit and full audit log." },
  { title: "Licenses", desc: "Software assignments and contract inventory with renewal alerts." },
  { title: "Systems", desc: "PC inventory auto-graded by CPU/GPU/RAM into capability tiers." },
  { title: "Peripherals", desc: "Projectors, printers, and peripherals with condition tracking." },
  { title: "Groups", desc: "Per-team headcount, tool counts, and system-tier breakdown." },
];

export default function PeopleHubStubPage() {
  return (
    <div className="page-shell min-h-screen pb-12 pt-24">
      <header className="employee-topbar">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-44">
            <Image src="/studio-lotus-logo.png" alt="Studio Lotus" fill sizes="176px" className="object-contain" priority />
          </div>
          <div className="hidden sm:block text-[0.6rem] font-semibold uppercase tracking-[0.4em] text-steel">
            Operating console
          </div>
        </div>
        <div className="employee-actions">
          <a href="/employee" className="public-button public-button--ghost">
            Workbook
          </a>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1560px]">
        <div className="max-w-3xl">
          <span className="workbook-chip text-xs font-semibold">Coming soon</span>
          <h1 className="mt-4 text-4xl font-semibold text-slate-900 sm:text-5xl">People &amp; Org</h1>
          <p className="mt-4 text-base text-steel">
            The Operating Console is being built. The backend (port 8004, schema <code>sl_people</code>) and
            database are provisioned; these modules light up as each phase ships.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {modules.map((m) => (
            <div key={m.title} className="section-card workbook-card min-h-[120px]">
              <h2 className="text-xl font-semibold text-slate-900">{m.title}</h2>
              <p className="mt-3 text-sm text-steel">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
