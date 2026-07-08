"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { pplGet } from "../_lib/client";
import { initialsFrom } from "../_lib/format";
import {
  FilterBar,
  FilterSelect,
  ResetFiltersButton,
  SavedViewsMenu,
  SearchInput,
  SegmentedControl,
  StatBand,
  type StatItem,
} from "../_components/data";
import type { GroupMemberOverview, GroupOverviewItem, GroupOverviewResponse } from "../_lib/types";

const FOCUS_OPTIONS = [
  { value: "all", label: "All groups" },
  { value: "risk", label: "Needs attention" },
];

type GroupsFilterSnapshot = { principal: string; search: string; focus: string };

type GroupInsight = {
  group: GroupOverviewItem;
  lead: GroupMemberOverview | null;
  people: GroupMemberOverview[];
  missingSystems: number;
  missingLicences: number;
  lowTierSystems: number;
  readiness: number;
  riskCount: number;
  topTools: Array<[string, number]>;
  tierEntries: Array<[string, number]>;
};

const LOW_TIERS = new Set(["Basic", "Entry"]);

export function GroupsClient() {
  const [data, setData] = useState<GroupOverviewResponse | null>(null);
  const [principal, setPrincipal] = useState("");
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<GroupInsight | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<GroupMemberOverview | null>(null);

  useEffect(() => {
    pplGet<GroupOverviewResponse>("/groups/overview")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const allInsights = useMemo(
    () => (data?.items || [])
      .map((group) => buildInsight(group, data?.tools || [], data?.tiers || []))
      .filter((insight) => !isEmptyDirectReports(insight)),
    [data],
  );

  const principals = useMemo(
    () => Array.from(new Set(allInsights.map(({ group }) => group.principal))).sort(),
    [allInsights],
  );

  const insights = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allInsights.filter((insight) => {
      const { group } = insight;
      if (principal && group.principal !== principal) return false;
      if (focus === "risk" && insight.riskCount === 0) return false;
      if (!needle) return true;
      return [
        group.name,
        group.principal,
        insight.lead?.name,
        group.members.map((m) => `${m.name} ${m.email || ""} ${m.title || ""}`).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [allInsights, principal, search, focus]);

  const totals = useMemo(() => {
    const source = allInsights;
    const people = source.reduce((sum, item) => sum + item.people.length, 0);
    const systems = source.reduce((sum, item) => sum + item.group.system_count, 0);
    const licences = source.reduce((sum, item) => sum + item.group.total_licences, 0);
    const risks = source.reduce((sum, item) => sum + item.riskCount, 0);
    const readiness = source.length ? Math.round(source.reduce((sum, item) => sum + item.readiness, 0) / source.length) : 0;
    return { people, systems, licences, risks, readiness };
  }, [allInsights]);

  const byPrincipal = useMemo(() => {
    const map = new Map<string, GroupInsight[]>();
    for (const insight of insights) {
      const bucket = map.get(insight.group.principal) || [];
      bucket.push(insight);
      map.set(insight.group.principal, bucket);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [insights]);

  const hasFilters = Boolean(principal || search || focus !== "all");

  function resetFilters() {
    setPrincipal("");
    setSearch("");
    setFocus("all");
  }

  const filterSnapshot: GroupsFilterSnapshot = { principal, search, focus };

  function applyFilterSnapshot(v: GroupsFilterSnapshot) {
    setPrincipal(v.principal ?? "");
    setSearch(v.search ?? "");
    setFocus(v.focus ?? "all");
  }

  const bandItems: StatItem[] = [
    { label: "Groups", value: loading ? "--" : String(allInsights.length) },
    { label: "People", value: loading ? "--" : String(totals.people) },
    { label: "Systems", value: loading ? "--" : String(totals.systems) },
    { label: "Licenses", value: loading ? "--" : String(totals.licences) },
    { label: "Readiness", value: loading ? "--" : `${totals.readiness}%`, tone: totals.readiness >= 75 ? "good" : totals.readiness >= 55 ? "warn" : "risk" },
    { label: "Risks", value: loading ? "--" : String(totals.risks), tone: totals.risks ? "risk" : "good" },
  ];

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <StatBand cols={6} items={bandItems} />

      <section className="public-panel">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="public-kicker">Leadership View</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Executive Group Console</h2>
            <p className="mt-1 text-xs text-steel">
              {loading ? "Loading..." : `${insights.length} visible group${insights.length === 1 ? "" : "s"} across ${byPrincipal.length} principal${byPrincipal.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <FilterBar>
            <SegmentedControl value={focus} onChange={setFocus} options={FOCUS_OPTIONS} />
            <FilterSelect value={principal} onChange={setPrincipal} label="All principals" options={principals} />
            <SearchInput value={search} onChange={setSearch} placeholder="Search group, lead, member" className="min-w-[240px]" />
            <SavedViewsMenu storageKey="ppl.groups.views" currentValues={filterSnapshot} onApply={applyFilterSnapshot} />
            <ResetFiltersButton show={hasFilters} onReset={resetFilters} />
          </FilterBar>
        </div>

        <div className="space-y-5">
          {byPrincipal.map(([principalName, principalGroups]) => (
            <PrincipalSection
              key={principalName}
              name={principalName}
              groups={principalGroups}
              onOpenGroup={setSelectedGroup}
              onOpenPerson={setSelectedPerson}
            />
          ))}
          {!loading && !insights.length ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">No groups match these filters.</div>
          ) : null}
        </div>
      </section>

      <GroupDrawer group={selectedGroup} onClose={() => setSelectedGroup(null)} onOpenPerson={setSelectedPerson} />
      <PersonDrawer person={selectedPerson} onClose={() => setSelectedPerson(null)} />
    </div>
  );
}

function buildInsight(group: GroupOverviewItem, tools: string[], tiers: string[]): GroupInsight {
  const people = group.members.filter((member) => member.name !== group.principal && member.employee_no !== group.team_lead);
  const lead = group.members.find((member) => member.employee_no === group.team_lead) || null;
  const missingSystems = people.filter((member) => !member.system).length;
  const missingLicences = people.filter((member) => member.licence_count === 0).length;
  const lowTierSystems = people.filter((member) => member.system?.tier && LOW_TIERS.has(member.system.tier)).length;
  const systemCoverage = people.length ? (people.length - missingSystems) / people.length : 1;
  const highTierCount = people.filter((member) => {
    const tier = member.system?.tier;
    return tier === "Workstation" || tier === "Performance" || tier === "Standard";
  }).length;
  const capabilityCoverage = people.length ? highTierCount / people.length : 1;
  const licenseCoverage = people.length ? (people.length - missingLicences) / people.length : 1;
  const readiness = Math.round((systemCoverage * 0.45 + capabilityCoverage * 0.35 + licenseCoverage * 0.2) * 100);
  const riskCount = missingSystems + missingLicences + lowTierSystems + (lead ? 0 : 1);
  const topTools = tools
    .map((tool): [string, number] => [tool, group.tool_counts[tool] || 0])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const tierEntries = tiers
    .map((tier): [string, number] => [tier, group.tier_counts[tier] || 0])
    .filter(([, count]) => count > 0);

  return { group, lead, people, missingSystems, missingLicences, lowTierSystems, readiness, riskCount, topTools, tierEntries };
}

function isEmptyDirectReports(insight: GroupInsight) {
  return insight.group.name.trim().toLowerCase() === "direct reports" && insight.people.length === 0;
}

function PrincipalSection({
  name,
  groups,
  onOpenGroup,
  onOpenPerson,
}: {
  name: string;
  groups: GroupInsight[];
  onOpenGroup: (group: GroupInsight) => void;
  onOpenPerson: (person: GroupMemberOverview) => void;
}) {
  const people = groups.reduce((sum, item) => sum + item.people.length, 0);
  const riskCount = groups.reduce((sum, item) => sum + item.riskCount, 0);
  const readiness = groups.length ? Math.round(groups.reduce((sum, item) => sum + item.readiness, 0) / groups.length) : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/75 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{name}</h3>
          <p className="text-xs text-steel">{groups.length} groups · {people} people · {readiness}% readiness</p>
        </div>
        <RiskBadge count={riskCount} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {groups.map((insight) => (
          <LeadershipTile key={insight.group.key} insight={insight} onOpenGroup={onOpenGroup} onOpenPerson={onOpenPerson} />
        ))}
      </div>
    </section>
  );
}

function LeadershipTile({
  insight,
  onOpenGroup,
  onOpenPerson,
}: {
  insight: GroupInsight;
  onOpenGroup: (group: GroupInsight) => void;
  onOpenPerson: (person: GroupMemberOverview) => void;
}) {
  const { group, lead, people, readiness } = insight;
  const accent = group.color || "#244C66";
  const readinessTone = readiness >= 75 ? "text-emerald-700 bg-emerald-50 border-emerald-200" : readiness >= 55 ? "text-amber-700 bg-amber-50 border-amber-200" : "text-red-700 bg-red-50 border-red-200";
  const previewPeople = [lead, ...people].filter(Boolean).slice(0, 4) as GroupMemberOverview[];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[var(--shadow-soft-hover)]">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onOpenGroup(insight)} className="min-w-0 text-left">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
            <div className="min-w-0">
              <h4 className="truncate text-base font-semibold text-slate-950">{group.name}</h4>
              <p className="truncate text-[11px] text-steel">{group.principal}</p>
            </div>
          </div>
        </button>
        <button type="button" onClick={() => onOpenGroup(insight)} className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold ${readinessTone}`}>
          {readiness}%
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Metric label="People" value={people.length} />
        <Metric label="Systems" value={group.system_count} />
        <Metric label="Licenses" value={group.total_licences} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Team lead</p>
          {lead ? (
            <button type="button" onClick={() => onOpenPerson(lead)} className="mt-0.5 truncate text-left text-sm font-semibold text-slate-900 hover:text-[#244C66]">
              {lead.name}
            </button>
          ) : (
            <p className="mt-0.5 text-sm font-semibold text-red-700">Not mapped</p>
          )}
        </div>
        <RiskBadge count={insight.riskCount} />
      </div>

      <div className="mt-4 space-y-2">
        <MiniBar label="Systems mapped" value={people.length ? people.length - insight.missingSystems : 0} total={people.length} />
        <MiniBar label="Licensed people" value={people.length ? people.length - insight.missingLicences : 0} total={people.length} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex -space-x-2">
          {previewPeople.map((person) => (
            <button
              key={person.employee_no}
              type="button"
              onClick={() => onOpenPerson(person)}
              title={person.name}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white"
              style={{ backgroundColor: person.designation_color || accent }}
            >
              {initialsFrom(person.name, person.employee_no)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onOpenGroup(insight)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Open detail
        </button>
      </div>
    </article>
  );
}

function GroupDrawer({
  group,
  onClose,
  onOpenPerson,
}: {
  group: GroupInsight | null;
  onClose: () => void;
  onOpenPerson: (person: GroupMemberOverview) => void;
}) {
  return (
    <AnimatePresence>
      {group ? (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22 }}
          >
            <div className="border-b border-slate-100 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="public-kicker">Group Detail</p>
                  <h3 className="mt-2 truncate text-2xl font-semibold text-slate-900">{group.group.name}</h3>
                  <p className="mt-1 text-sm text-steel">{group.group.principal} · {group.people.length} people · {group.readiness}% readiness</p>
                </div>
                <button onClick={onClose} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">X</button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Systems" value={group.group.system_count} />
                <Metric label="Licenses" value={group.group.total_licences} />
                <Metric label="No system" value={group.missingSystems} />
                <Metric label="Risks" value={group.riskCount} />
              </div>
            </div>
            <div className="flex-1 space-y-5 overflow-auto p-5">
              <section>
                <h4 className="text-sm font-semibold text-slate-900">Leadership</h4>
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {group.lead ? <PersonRow person={group.lead} onOpen={onOpenPerson} /> : <p className="text-sm font-semibold text-red-700">Team lead is not mapped.</p>}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-semibold text-slate-900">Readiness Signals</h4>
                <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <MiniBar label="Systems mapped" value={group.people.length - group.missingSystems} total={group.people.length} />
                  <MiniBar label="Licenses mapped" value={group.people.length - group.missingLicences} total={group.people.length} />
                  <MiniBar label="Non-basic systems" value={group.people.length - group.lowTierSystems} total={group.people.length} />
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <Breakdown title="Top Tools" entries={group.topTools} empty="No license data" />
                <Breakdown title="System Tiers" entries={group.tierEntries} empty="No systems mapped" />
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-900">People</h4>
                  <span className="text-xs text-steel">{group.group.members.length} mapped rows</span>
                </div>
                <div className="space-y-2">
                  {group.group.members.map((person) => <PersonRow key={person.employee_no} person={person} onOpen={onOpenPerson} />)}
                </div>
              </section>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function PersonDrawer({ person, onClose }: { person: GroupMemberOverview | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {person ? (
        <>
          <motion.div className="fixed inset-0 z-[55] bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="fixed right-0 top-0 z-[60] flex h-full w-full max-w-sm flex-col bg-white shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22 }}
          >
            <div className="flex items-start gap-3 border-b border-slate-100 p-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ backgroundColor: person.designation_color || "#707A87" }}>
                {initialsFrom(person.name, person.employee_no)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-semibold text-slate-900">{person.name}</h3>
                <p className="text-sm text-steel">{person.title || "No title"}</p>
                <p className="text-xs text-slate-400">{person.employee_no}</p>
              </div>
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-50">X</button>
            </div>
            <div className="flex-1 space-y-3 overflow-auto p-5 text-sm">
              <DetailRow label="Email" value={person.email} />
              <DetailRow label="Designation" value={person.designation_level} />
              <DetailRow label="Licenses" value={person.licences.length ? person.licences.join(", ") : "None mapped"} />
              <DetailRow label="System" value={person.system?.system_id} />
              <DetailRow label="System Tier" value={person.system?.tier} />
              <DetailRow label="System Score" value={person.system?.grade_score != null ? String(person.system.grade_score) : null} />
              <DetailRow label="CPU" value={person.system?.processor} />
              <DetailRow label="GPU" value={person.system?.gpu} />
              <DetailRow label="RAM" value={person.system?.ram_gb != null ? `${person.system.ram_gb} GB` : null} />
              <DetailRow label="Upgrade" value={person.system?.upgrade_suggestion} />
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function PersonRow({ person, onOpen }: { person: GroupMemberOverview; onOpen: (person: GroupMemberOverview) => void }) {
  const hasRisk = !person.system || person.licence_count === 0 || (person.system.tier ? LOW_TIERS.has(person.system.tier) : false);
  return (
    <button type="button" onClick={() => onOpen(person)} className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50">
      <div className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: person.designation_color || "#707A87" }}>
        {initialsFrom(person.name, person.employee_no)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{person.name}</p>
        <p className="truncate text-xs text-steel">{person.title || "No title"} · {person.email || person.employee_no}</p>
      </div>
      <div className="flex flex-col items-end gap-1 text-[11px] font-semibold">
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">{person.licence_count} lic</span>
        <span className={`rounded-full border px-2 py-0.5 ${hasRisk ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {person.system?.tier || "No system"}
        </span>
      </div>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-base font-semibold text-slate-900">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-steel">{label}</p>
    </div>
  );
}

function MiniBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-[11px] font-semibold text-steel">
        <span>{label}</span>
        <span>{value}/{total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-[#244C66]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RiskBadge({ count }: { count: number }) {
  const cls = count ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{count ? `${count} risks` : "Clear"}</span>;
}

function Breakdown({ title, entries, empty }: { title: string; entries: Array<[string, number]>; empty: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel">{title}</p>
      {entries.length ? entries.map(([label, value]) => (
        <div key={label} className="mb-1 flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-slate-700">{label}</span>
          <span className="font-semibold text-slate-900">{value}</span>
        </div>
      )) : <p className="text-xs text-slate-400">{empty}</p>}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 pb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="max-w-[13rem] text-right text-sm text-slate-800">{value || "--"}</span>
    </div>
  );
}
