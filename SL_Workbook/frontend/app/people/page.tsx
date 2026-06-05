import Link from "next/link";
import { PeopleHeader } from "./_components/PeopleHeader";
import { isPeopleSuperadmin } from "./_lib/access-server";

// People / Operating Console hub. Employees is live (Phase 1); the remaining
// modules light up as later phases ship.

const modules = [
  { title: "People / Org", desc: "Group-based org chart with drag-drop moves and a draft/publish system.", href: "/people/org", live: true },
  { title: "Employees", desc: "Directory + 6-tab profile with inline edit and full audit log.", href: "/people/employees", live: true },
  { title: "Licenses", desc: "Software assignments and contract inventory with renewal alerts.", href: "/people/licenses", live: true },
  { title: "Systems", desc: "PC inventory auto-graded by CPU/GPU/RAM into capability tiers.", href: "/people/systems", live: true },
  { title: "Peripherals", desc: "Projectors, printers, and peripherals with condition tracking.", href: "/people/peripherals", live: true },
  { title: "Groups", desc: "Per-team headcount, tool counts, and system-tier breakdown.", href: "/people/groups", live: true },
];

export default async function PeopleHubPage() {
  const canSeeEmployees = await isPeopleSuperadmin();
  const visibleModules = modules.filter((module) => module.title !== "Employees" || canSeeEmployees);

  return (
    <div className="page-shell min-h-screen pb-12 pt-24">
      <PeopleHeader />
      <div className="mx-auto w-full max-w-[1560px]">
        <div className="max-w-3xl">
          <h1 className="mt-4 text-4xl font-semibold text-slate-900 sm:text-5xl">People &amp; Org</h1>
          <p className="mt-4 text-base text-steel">
            The Operating Console — employee master, org chart, licenses, systems, and peripherals.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {visibleModules.map((m) =>
            m.live && m.href ? (
              <Link key={m.title} href={m.href} className="section-card workbook-card group min-h-[120px]">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-slate-900">{m.title}</h2>
                  <span className="inline-flex items-center rounded-full border border-[#d1d1d1] bg-white px-3 py-1 text-[11px] font-semibold text-steel">Open -&gt;</span>
                </div>
                <p className="mt-3 text-sm text-steel">{m.desc}</p>
              </Link>
            ) : (
              <div key={m.title} className="section-card workbook-card min-h-[120px] opacity-70">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-slate-900">{m.title}</h2>
                  <span className="workbook-chip text-[11px] font-semibold">Coming soon</span>
                </div>
                <p className="mt-3 text-sm text-steel">{m.desc}</p>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
