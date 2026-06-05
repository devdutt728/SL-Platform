import Link from "next/link";
import type { ReactNode } from "react";
import { PeopleHeader } from "./_components/PeopleHeader";
import { isPeopleSuperadmin } from "./_lib/access-server";

// People / Operating Console hub. Mirrors the Workbook landing idiom: each
// module is a workbook-card with a gradient icon tile, eyebrow label, and
// capability chips so the hub reads as a polished console rather than a
// list of bare boxes.

type Module = {
  label: string;
  title: string;
  desc: string;
  href: string;
  accent: string;
  tags: string[];
  icon: ReactNode;
};

const modules: Module[] = [
  {
    label: "STRUCTURE",
    title: "People / Org",
    desc: "Group-based org chart with drag-drop moves and a draft/publish system.",
    href: "/people/org",
    accent: "from-[#E74011]/26 to-[#5D5552]/12",
    tags: ["Drag-drop moves", "Draft / publish", "Audit log"],
    icon: <OrgIcon />,
  },
  {
    label: "DIRECTORY",
    title: "Employees",
    desc: "Directory and 6-tab profile with inline edit and full audit log.",
    href: "/people/employees",
    accent: "from-[#244C66]/28 to-[#0F172A]/12",
    tags: ["Inline edit", "Encrypted PII", "Audit-ready"],
    icon: <PeopleIcon />,
  },
  {
    label: "SOFTWARE",
    title: "Licenses",
    desc: "Software assignments and contract inventory with renewal alerts.",
    href: "/people/licenses",
    accent: "from-[#0F766E]/26 to-[#0F172A]/12",
    tags: ["Assignments", "Renewal alerts"],
    icon: <LicenseIcon />,
  },
  {
    label: "HARDWARE",
    title: "Systems",
    desc: "PC inventory auto-graded by CPU/GPU/RAM into capability tiers.",
    href: "/people/systems",
    accent: "from-[#5B4FB5]/26 to-[#0F172A]/12",
    tags: ["Auto-graded", "Capability tiers"],
    icon: <SystemIcon />,
  },
  {
    label: "EQUIPMENT",
    title: "Peripherals",
    desc: "Projectors, printers, and peripherals with condition tracking.",
    href: "/people/peripherals",
    accent: "from-[#B0570C]/26 to-[#5D5552]/12",
    tags: ["Condition tracking", "Inventory"],
    icon: <PeripheralIcon />,
  },
  {
    label: "ANALYTICS",
    title: "Groups",
    desc: "Per-team headcount, tool counts, and system-tier breakdown.",
    href: "/people/groups",
    accent: "from-[#9A1750]/24 to-[#0F172A]/12",
    tags: ["Headcount", "Tier breakdown"],
    icon: <GroupsIcon />,
  },
];

export default async function PeopleHubPage() {
  const canSeeEmployees = await isPeopleSuperadmin();
  const visibleModules = modules.filter((m) => m.title !== "Employees" || canSeeEmployees);

  return (
    <div className="page-shell min-h-screen pb-16 pt-24">
      <PeopleHeader />
      <div className="mx-auto w-full max-w-[1560px]">
        <div className="max-w-3xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-steel">Operating Console</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-900 sm:text-5xl">People &amp; Org</h1>
          <p className="mt-4 text-base text-steel">
            The employee master, org chart, licenses, systems, and peripherals — one console, one identity.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visibleModules.map((m) => (
            <Link
              key={m.title}
              href={m.href}
              className="section-card workbook-card group flex min-h-[200px] flex-col"
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`workbook-icon flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${m.accent}`}
                >
                  {m.icon}
                </div>
                <span className="workbook-open inline-flex items-center gap-1 text-[11px] font-semibold text-steel">
                  Open
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="13 6 19 12 13 18" />
                  </svg>
                </span>
              </div>

              <div className="mt-4">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-steel">{m.label}</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">{m.title}</h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-steel">{m.desc}</p>

              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {m.tags.map((tag) => (
                  <span key={tag} className="workbook-chip text-[11px] font-semibold">
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function OrgIcon() {
  return (
    <svg className="h-5 w-5 text-slate-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="16" width="6" height="5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="15" y="16" width="6" height="5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v4m0 0H6v4m6-4h6v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg className="h-5 w-5 text-slate-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 19c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.5 19c0-2.4 1.4-4.3 3.5-4.3 1.4 0 2.5.8 3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function LicenseIcon() {
  return (
    <svg className="h-5 w-5 text-slate-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 9h16" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 14h4m4-1.6 1.4 1.4 2.2-2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg className="h-5 w-5 text-slate-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 7V4m4 3V4m-4 16v-3m4 3v-3M7 10H4m3 4H4m16-4h-3m3 4h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PeripheralIcon() {
  return (
    <svg className="h-5 w-5 text-slate-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 18h8m-4-3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16.5" cy="10.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function GroupsIcon() {
  return (
    <svg className="h-5 w-5 text-slate-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 20V11m7 9V4m7 16v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
