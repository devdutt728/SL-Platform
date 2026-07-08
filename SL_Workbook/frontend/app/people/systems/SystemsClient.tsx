"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { pplDelete, pplGet, pplPatch, pplPost } from "../_lib/client";
import { DirectoryWarning, PersonCombobox } from "../_components/PersonCombobox";
import {
  ColumnToggle,
  DataTable,
  FilterBar,
  FilterSelect,
  GroupedTable,
  GroupMetaStat,
  MultiSelectFilter,
  ResetFiltersButton,
  SavedViewsMenu,
  SearchInput,
  SegmentedControl,
  VIEW_OPTIONS,
  exportTableCsv,
  useDebounced,
  usePersistentColumns,
} from "../_components/data";
import type { MeResponse, SystemGradePreviewResponse, SystemInventoryItem, SystemInventoryListResponse } from "../_lib/types";

const TIERS = ["Workstation", "Performance", "Standard", "Basic", "Entry"];
const STATUS_OPTIONS = ["Active", "In Repair", "Faulty", "Retired", "In Stock", "Fixed"];
const VISIBILITY_OPTIONS = ["current", "fixed", "all"];
const VISIBILITY_LABELS: Record<string, string> = {
  current: "Current systems",
  fixed: "Fixed / stock PCs",
  all: "All systems",
};
const PAGE_LIMIT = 500;
const COLUMN_PREF_KEY = "ppl.systems.columns";

const emptySystem = {
  system_id: "",
  system_type: "Desktop",
  assigned_email: "",
  user_display: "",
  team: "",
  processor: "",
  ram_gb: "",
  graphics_card: "",
  storage: "",
  os: "",
  autocad_version: "",
  sketchup_version: "",
  threedmax_version: "",
  rhino_version: "",
  enscape_version: "",
  d5_render: "",
  adobe_versions: "",
  office_version: "",
  antivirus: "",
  purchase_date: "",
  vendor: "",
  service_tag: "",
  serial_no: "",
  status: "Active",
  notes: "",
};

type FormState = typeof emptySystem;

type SystemsFilterSnapshot = {
  search: string;
  tier: string;
  status: string;
  selectedTeams: string[];
  systemType: string;
  vendor: string;
  os: string;
  assignment: string;
  visibility: string;
  minRam: string;
  minScore: string;
  view: string;
};

export function SystemsClient() {
  const [rows, setRows] = useState<SystemInventoryItem[]>([]);
  const [tierCounts, setTierCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 250);
  const [tier, setTier] = useState("");
  const [status, setStatus] = useState("");
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [systemType, setSystemType] = useState("");
  const [vendor, setVendor] = useState("");
  const [os, setOs] = useState("");
  const [assignment, setAssignment] = useState("");
  const [visibility, setVisibility] = useState("current");
  const [view, setView] = useState<string>("table");
  const [minRam, setMinRam] = useState("");
  const [minScore, setMinScore] = useState("");
  const [form, setForm] = useState<FormState>(emptySystem);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<SystemInventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "score", desc: true }]);
  const [columnVisibility, setColumnVisibility] = usePersistentColumns(COLUMN_PREF_KEY, {
    service_tag: false,
    serial_no: false,
    motherboard: false,
    cpu_cores: false,
    ram_slots_free: false,
    autocad_version: false,
    sketchup_version: false,
    threedmax_version: false,
    rhino_version: false,
    enscape_version: false,
    d5_render: false,
    adobe_versions: false,
    office_version: false,
    antivirus: false,
    notes: false,
    updated_at: false,
  });

  const load = () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ page: "1", limit: String(PAGE_LIMIT) });
    if (search.trim()) qs.set("search", search.trim());
    if (tier) qs.set("tier", tier);
    if (status) qs.set("status", status);
    qs.set("visibility", visibility);
    pplGet<SystemInventoryListResponse>(`/systems?${qs.toString()}`)
      .then((data) => {
        setRows(data.items);
        setTierCounts(data.tier_counts);
        setTotal(data.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    pplGet<MeResponse>("/auth/me").then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tier, status, visibility]);

  const optionSets = useMemo(
    () => ({
      teams: unique(rows.map((r) => r.team)),
      types: unique(rows.map((r) => r.system_type)),
      vendors: unique(rows.map((r) => r.vendor)),
      oses: unique(rows.map((r) => r.os)),
      statuses: unique(rows.map((r) => r.status)),
    }),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const ramFloor = Number(minRam);
    const scoreFloor = Number(minScore);
    return rows.filter((row) => {
      if (selectedTeams.length && (!row.team || !selectedTeams.includes(row.team))) return false;
      if (systemType && row.system_type !== systemType) return false;
      if (vendor && row.vendor !== vendor) return false;
      if (os && row.os !== os) return false;
      if (assignment === "assigned" && !hasAssignment(row)) return false;
      if (assignment === "unassigned" && hasAssignment(row)) return false;
      if (minRam && ((row.ram_gb ?? 0) < ramFloor || Number.isNaN(ramFloor))) return false;
      if (minScore && ((row.composite_score ?? 0) < scoreFloor || Number.isNaN(scoreFloor))) return false;
      return true;
    });
  }, [rows, selectedTeams, systemType, vendor, os, assignment, minRam, minScore]);

  async function createSystem() {
    if (!form.system_id.trim()) return;
    setSaving(true);
    try {
      await pplPost("/systems", cleanPayload({ ...form, ram_gb: form.ram_gb ? Number(form.ram_gb) : null }));
      setForm(emptySystem);
      setShowAdd(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add system");
    } finally {
      setSaving(false);
    }
  }

  async function updateSystem(id: string, body: Record<string, unknown>) {
    try {
      await pplPatch(`/systems/${id}`, cleanPayload(body));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update system");
    }
  }

  async function regradeSystem(id: string) {
    try {
      await pplPost(`/systems/${id}/regrade`, {});
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not regrade system");
    }
  }

  async function saveEdit(id: string, body: Record<string, unknown>) {
    // Edit drawer can clear fields, so send "" as null instead of dropping it.
    const payload = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, v === "" ? null : v]),
    );
    await pplPatch(`/systems/${id}`, payload);
    load();
  }

  async function deleteSystem(id: string) {
    try {
      await pplDelete(`/systems/${id}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete system");
    }
  }

  const columns = useMemo<ColumnDef<SystemInventoryItem>[]>(
    () => [
      {
        accessorKey: "system_id",
        header: "System",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold text-slate-900">{row.original.system_id || "-"}</div>
            <div className="text-[11px] text-steel">{row.original.system_type || "No type"}</div>
          </div>
        ),
      },
      {
        id: "assignee",
        header: "Assignee",
        accessorFn: (row) => row.user_display || row.assigned_email || "",
        cell: ({ row }) => (
          <div>
            <div className="max-w-[220px] truncate font-medium text-slate-800">{row.original.user_display || "Unassigned"}</div>
            <div className="max-w-[220px] truncate text-[11px] text-steel">{row.original.assigned_email || "-"}</div>
          </div>
        ),
      },
      { accessorKey: "team", header: "Team", cell: (c) => c.getValue() || "-" },
      {
        accessorKey: "capability_tier",
        header: "Tier",
        cell: ({ row }) => <TierBadge tier={row.original.capability_tier} />,
      },
      {
        id: "score",
        header: "Score",
        accessorFn: (row) => row.composite_score ?? 0,
        cell: ({ row }) => <ScoreCell score={row.original.composite_score} />,
      },
      { accessorKey: "processor", header: "CPU", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "graphics_card", header: "GPU", cell: (c) => <Truncated value={c.getValue()} /> },
      {
        accessorKey: "ram_gb",
        header: "RAM",
        cell: ({ row }) => (row.original.ram_gb != null ? `${row.original.ram_gb} GB` : "-"),
      },
      { accessorKey: "storage", header: "Storage", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "os", header: "OS", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "vendor", header: "Vendor", cell: (c) => c.getValue() || "-" },
      { accessorKey: "service_tag", header: "Service Tag", cell: (c) => c.getValue() || "-" },
      { accessorKey: "serial_no", header: "Serial No", cell: (c) => c.getValue() || "-" },
      { accessorKey: "motherboard", header: "Motherboard", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "cpu_cores", header: "CPU Cores", cell: (c) => c.getValue() || "-" },
      { accessorKey: "ram_slots_free", header: "RAM Slots", cell: (c) => c.getValue() || "-" },
      { accessorKey: "autocad_version", header: "AutoCAD", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "sketchup_version", header: "SketchUp", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "threedmax_version", header: "3ds Max", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "rhino_version", header: "Rhino", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "enscape_version", header: "Enscape", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "d5_render", header: "D5 Render", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "adobe_versions", header: "Adobe", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "office_version", header: "Office", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "antivirus", header: "Antivirus", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "purchase_date", header: "Purchase Date", cell: (c) => c.getValue() || "-" },
      { accessorKey: "upgrade_suggestion", header: "Upgrade Guidance", cell: (c) => <Truncated value={c.getValue()} width="max-w-[300px]" /> },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <InlineSelect
            value={row.original.status}
            options={STATUS_OPTIONS}
            onChange={(next) => updateSystem(row.original.id, { status: next })}
          />
        ),
      },
      { accessorKey: "notes", header: "Notes", cell: (c) => <Truncated value={c.getValue()} /> },
      { accessorKey: "updated_at", header: "Updated", cell: (c) => c.getValue() || "-" },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(row.original)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Edit
            </button>
            <button onClick={() => regradeSystem(row.original.id)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Regrade
            </button>
            <button onClick={() => deleteSystem(row.original.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
              Delete
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const visibleCount = table.getRowModel().rows.length;
  const hasFilters = Boolean(searchInput || tier || status || visibility !== "current" || selectedTeams.length || systemType || vendor || os || assignment || minRam || minScore);

  const totalMachines = useMemo(() => Object.values(tierCounts).reduce((a, b) => a + b, 0) || total, [tierCounts, total]);

  function resetFilters() {
    setSearchInput("");
    setTier("");
    setStatus("");
    setVisibility("current");
    setSelectedTeams([]);
    setSystemType("");
    setVendor("");
    setOs("");
    setAssignment("");
    setMinRam("");
    setMinScore("");
  }

  const filterSnapshot: SystemsFilterSnapshot = {
    search: searchInput,
    tier,
    status,
    selectedTeams,
    systemType,
    vendor,
    os,
    assignment,
    visibility,
    minRam,
    minScore,
    view,
  };

  function applyFilterSnapshot(v: SystemsFilterSnapshot) {
    setSearchInput(v.search ?? "");
    setTier(v.tier ?? "");
    setStatus(v.status ?? "");
    setSelectedTeams(v.selectedTeams ?? []);
    setSystemType(v.systemType ?? "");
    setVendor(v.vendor ?? "");
    setOs(v.os ?? "");
    setAssignment(v.assignment ?? "");
    setVisibility(v.visibility ?? "current");
    setMinRam(v.minRam ?? "");
    setMinScore(v.minScore ?? "");
    setView(v.view ?? "table");
  }

  return (
    <div className="space-y-4">
      {/* Compact sticky toolbar — matches Org/Groups header pattern */}
      <div className="sticky top-[5.5rem] z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-soft)] bg-white/85 px-4 py-3 shadow-[var(--shadow-soft)] backdrop-blur">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-[rgb(var(--ink))]">Systems</h1>
            <span className="rounded-full bg-[rgb(var(--mist))] px-2.5 py-0.5 text-[11px] font-semibold text-[rgb(var(--steel))]">
              {totalMachines} machines
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-[rgb(var(--steel))]">
            {loading ? "Loading inventory…" : `${visibleCount} shown · ${VISIBILITY_LABELS[visibility]} · ${optionSets.teams.length} teams`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search ID, email, CPU, GPU…" />
          <SegmentedControl value={view} onChange={setView} options={VIEW_OPTIONS} />
          <ColumnToggle table={table} />
          <SavedViewsMenu storageKey="ppl.systems.views" currentValues={filterSnapshot} onApply={applyFilterSnapshot} />
          {me?.is_platform_superadmin ? (
            <button onClick={() => exportTableCsv(table, "systems-inventory")} className="ppl-btn ppl-btn--ghost">Export</button>
          ) : null}
          <button onClick={() => setShowAdd((v) => !v)} className={`ppl-btn ${showAdd ? "ppl-btn--active" : "ppl-btn--primary"}`}>
            {showAdd ? "Close" : "Add system"}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {/* Compact tier filter strip — segmented, doubles as filter */}
      <div className="flex flex-wrap items-stretch gap-2">
        <button
          onClick={() => setTier("")}
          className={`flex min-w-[88px] flex-col rounded-xl border px-3 py-2 text-left transition ${tier === "" ? "border-[var(--brand-color)] bg-[var(--brand-color)] text-white" : "border-[var(--border-soft)] bg-white text-[rgb(var(--ink))] hover:border-slate-300"}`}
        >
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${tier === "" ? "text-white/75" : "text-steel"}`}>All</span>
          <span className="text-lg font-semibold leading-tight">{totalMachines}</span>
        </button>
        {TIERS.map((t) => {
          const active = tier === t;
          return (
            <button
              key={t}
              onClick={() => setTier(active ? "" : t)}
              className={`flex min-w-[110px] flex-1 flex-col rounded-xl border px-3 py-2 text-left transition ${active ? "border-[var(--brand-color)] bg-[var(--brand-color)] text-white" : "border-[var(--border-soft)] bg-white text-[rgb(var(--ink))] hover:border-slate-300"}`}
            >
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${active ? "text-white/75" : "text-steel"}`}>{t}</span>
              <span className="text-lg font-semibold leading-tight">{tierCounts[t] || 0}</span>
            </button>
          );
        })}
      </div>

      <section className="public-panel">
        {/* Slim inline filter row */}
        <FilterBar className="mb-3">
          <FilterSelect value={status} onChange={setStatus} label="All statuses" options={optionSets.statuses.length ? optionSets.statuses : STATUS_OPTIONS} />
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-[var(--brand-color)] focus:outline-none"
          >
            {VISIBILITY_OPTIONS.map((v) => (
              <option key={v} value={v}>{VISIBILITY_LABELS[v]}</option>
            ))}
          </select>
          <MultiSelectFilter selected={selectedTeams} onChange={setSelectedTeams} options={optionSets.teams} noun="team" />
          <FilterSelect value={assignment} onChange={setAssignment} label="Any assignment" options={["assigned", "unassigned"]} labels={{ assigned: "Assigned only", unassigned: "Unassigned only" }} />
          <FilterSelect value={systemType} onChange={setSystemType} label="All types" options={optionSets.types} />
          <FilterSelect value={vendor} onChange={setVendor} label="All vendors" options={optionSets.vendors} />
          <FilterSelect value={os} onChange={setOs} label="All OS" options={optionSets.oses} />
          <input value={minRam} onChange={(e) => setMinRam(e.target.value)} inputMode="numeric" placeholder="Min RAM" className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400" />
          <input value={minScore} onChange={(e) => setMinScore(e.target.value)} inputMode="numeric" placeholder="Min score" className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400" />
          <ResetFiltersButton show={hasFilters} onReset={resetFilters} />
        </FilterBar>

        {showAdd ? (
          <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="grid gap-2 lg:grid-cols-6">
            <Input value={form.system_id} placeholder="system id" onChange={(v) => setForm({ ...form, system_id: v })} />
            <Input value={form.system_type} placeholder="system type" onChange={(v) => setForm({ ...form, system_type: v })} />
            <div className="lg:col-span-2">
              <PersonCombobox
                value={form.assigned_email}
                onChange={(v) => setForm({ ...form, assigned_email: v })}
                onPick={(p) => setForm({ ...form, assigned_email: p.email, user_display: p.name, team: p.team || form.team })}
                placeholder="assigned person (name or email)"
                inputClassName="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400"
              />
              <DirectoryWarning email={form.assigned_email} />
            </div>
            <Input value={form.team} placeholder="team" onChange={(v) => setForm({ ...form, team: v })} />
            <Input value={form.processor} placeholder="processor" onChange={(v) => setForm({ ...form, processor: v })} />
            <Input value={form.ram_gb} placeholder="RAM GB" onChange={(v) => setForm({ ...form, ram_gb: v })} />
            <Input value={form.graphics_card} placeholder="graphics card" onChange={(v) => setForm({ ...form, graphics_card: v })} />
            <Input value={form.storage} placeholder="storage" onChange={(v) => setForm({ ...form, storage: v })} />
            <Input value={form.os} placeholder="OS" onChange={(v) => setForm({ ...form, os: v })} />
            <Input value={form.vendor} placeholder="vendor" onChange={(v) => setForm({ ...form, vendor: v })} />
            <Input value={form.service_tag} placeholder="service tag" onChange={(v) => setForm({ ...form, service_tag: v })} />
            <Input value={form.serial_no} placeholder="serial no" onChange={(v) => setForm({ ...form, serial_no: v })} />
            <Input value={form.purchase_date} placeholder="purchase date YYYY-MM-DD" onChange={(v) => setForm({ ...form, purchase_date: v })} />
            <Input value={form.autocad_version} placeholder="AutoCAD" onChange={(v) => setForm({ ...form, autocad_version: v })} />
            <Input value={form.sketchup_version} placeholder="SketchUp" onChange={(v) => setForm({ ...form, sketchup_version: v })} />
            <Input value={form.threedmax_version} placeholder="3ds Max" onChange={(v) => setForm({ ...form, threedmax_version: v })} />
            <Input value={form.rhino_version} placeholder="Rhino" onChange={(v) => setForm({ ...form, rhino_version: v })} />
            <Input value={form.enscape_version} placeholder="Enscape" onChange={(v) => setForm({ ...form, enscape_version: v })} />
            <Input value={form.d5_render} placeholder="D5 Render" onChange={(v) => setForm({ ...form, d5_render: v })} />
            <Input value={form.adobe_versions} placeholder="Adobe" onChange={(v) => setForm({ ...form, adobe_versions: v })} />
            <Input value={form.office_version} placeholder="Office" onChange={(v) => setForm({ ...form, office_version: v })} />
            <Input value={form.antivirus} placeholder="antivirus" onChange={(v) => setForm({ ...form, antivirus: v })} />
            <Input value={form.notes} placeholder="notes" onChange={(v) => setForm({ ...form, notes: v })} />
            <button disabled={saving} onClick={createSystem} className="rounded-xl bg-[var(--brand-color)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              Add System
            </button>
          </div>
          </div>
        ) : null}

        {view === "grouped" ? (
          <GroupedTable
            table={table}
            groupKey={(row) => row.team}
            emptyGroupLabel="No team"
            countNoun="machine"
            minWidth={1900}
            loading={loading}
            metaFor={(groupRows) => {
              const assigned = groupRows.filter((r) => hasAssignment(r.original)).length;
              return <GroupMetaStat label="assigned" value={`${assigned}/${groupRows.length}`} />;
            }}
          />
        ) : (
          <DataTable
            table={table}
            minWidth={1900}
            maxHeight="76vh"
            pinnedLeft={["system_id"]}
            pinnedRight={["actions"]}
            emptyLabel="No systems match these filters."
            loading={loading}
          />
        )}
        <p className="mt-2 text-[11px] text-steel">
          {view === "grouped"
            ? "Grouped by team. Collapse a team to focus, or switch back to Table for the full pinned view."
            : "Tip: the System and Actions columns stay pinned while you scroll sideways. Click Edit on any row to change all of its details."}
        </p>
      </section>

      <EditDrawer system={editing} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={deleteSystem} />
    </div>
  );
}

const EDIT_FIELDS: Array<{ section: string; kind?: "assignment"; fields: Array<{ key: keyof SystemInventoryItem; label: string; type?: "select" | "number"; options?: string[] }> }> = [
  {
    section: "Identity",
    fields: [
      { key: "system_id", label: "System ID" },
      { key: "system_type", label: "System type" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
  },
  {
    section: "Assignment",
    kind: "assignment",
    fields: [
      { key: "team", label: "Team" },
    ],
  },
  {
    section: "Hardware",
    fields: [
      { key: "processor", label: "CPU" },
      { key: "cpu_cores", label: "CPU cores" },
      { key: "graphics_card", label: "GPU" },
      { key: "ram_gb", label: "RAM (GB)", type: "number" },
      { key: "ram_slots_free", label: "Free RAM slots" },
      { key: "storage", label: "Storage" },
      { key: "motherboard", label: "Motherboard" },
      { key: "os", label: "OS" },
    ],
  },
  {
    section: "Software",
    fields: [
      { key: "autocad_version", label: "AutoCAD" },
      { key: "sketchup_version", label: "SketchUp" },
      { key: "threedmax_version", label: "3ds Max" },
      { key: "rhino_version", label: "Rhino" },
      { key: "enscape_version", label: "Enscape" },
      { key: "d5_render", label: "D5 Render" },
      { key: "adobe_versions", label: "Adobe" },
      { key: "office_version", label: "Office" },
      { key: "antivirus", label: "Antivirus" },
    ],
  },
  {
    section: "Procurement",
    fields: [
      { key: "vendor", label: "Vendor" },
      { key: "purchase_date", label: "Purchase date" },
      { key: "service_tag", label: "Service tag" },
      { key: "serial_no", label: "Serial no" },
    ],
  },
];

function EditDrawer({
  system,
  onClose,
  onSave,
  onDelete,
}: {
  system: SystemInventoryItem | null;
  onClose: () => void;
  onSave: (id: string, body: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const debouncedDraft = useDebounced(draft, 250);
  const [preview, setPreview] = useState<SystemGradePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!system) return;
    const next: Record<string, string> = {};
    for (const group of EDIT_FIELDS) {
      for (const f of group.fields) {
        const v = system[f.key];
        next[f.key as string] = v == null ? "" : String(v);
      }
    }
    // Assignment fields are rendered specially (combobox), not via EDIT_FIELDS.
    next.assigned_email = system.assigned_email ?? "";
    next.user_display = system.user_display ?? "";
    next.notes = system.notes ?? "";
    setDraft(next);
    setErr(null);
  }, [system]);

  useEffect(() => {
    if (!system) return;
    let cancelled = false;
    setPreviewLoading(true);
    pplPost<SystemGradePreviewResponse>("/systems/grade-preview", {
      processor: debouncedDraft.processor || null,
      graphics_card: debouncedDraft.graphics_card || null,
      ram_gb: toNullableNumber(debouncedDraft.ram_gb),
    })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [system, debouncedDraft.processor, debouncedDraft.graphics_card, debouncedDraft.ram_gb]);

  async function handleSave() {
    if (!system) return;
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { ...draft };
      if ("ram_gb" in body) body.ram_gb = toNullableNumber(draft.ram_gb);
      await onSave(system.id, body);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {system ? (
        <>
          <motion.div className="fixed inset-0 z-50 bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="fixed right-0 top-0 z-[60] flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div className="min-w-0">
                <p className="public-kicker">Edit System</p>
                <h3 className="mt-2 truncate text-2xl font-semibold text-slate-900">{system.system_id || "Untitled"}</h3>
                <p className="mt-1 text-sm text-steel">
                  {system.capability_tier || "Ungraded"} · score {system.composite_score ?? 0} · {system.status}
                </p>
              </div>
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">X</button>
            </div>

            <div className="flex-1 space-y-5 overflow-auto p-5">
              {err ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div> : null}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-steel">Live grade preview</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {previewLoading ? "Calculating..." : preview ? `${preview.tier} · score ${preview.score}` : "Preview unavailable"}
                    </p>
                  </div>
                  {preview ? (
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-slate-600">
                      <MetricPill label="CPU" value={preview.cpu_score} />
                      <MetricPill label="GPU" value={preview.gpu_score} />
                      <MetricPill label="RAM" value={preview.ram_score} />
                    </div>
                  ) : null}
                </div>
                {preview ? <p className="mt-2 text-xs text-steel">{preview.suggestion}</p> : null}
              </div>
              {EDIT_FIELDS.map((group) => (
                <section key={group.section}>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel">{group.section}</h4>
                  {group.kind === "assignment" ? (
                    <div className="mb-3">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">Assigned to</span>
                      <PersonCombobox
                        value={draft.assigned_email ?? ""}
                        onChange={(email) => setDraft((d) => ({ ...d, assigned_email: email }))}
                        onPick={(p) => setDraft((d) => ({ ...d, assigned_email: p.email, user_display: p.name, team: p.team || d.team }))}
                      />
                      <DirectoryWarning email={draft.assigned_email ?? ""} />
                      {draft.user_display ? (
                        <p className="mt-1 text-[11px] text-steel">Name on record: <span className="font-medium text-slate-700">{draft.user_display}</span></p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.fields.map((f) => (
                      <label key={f.key as string} className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-500">{f.label}</span>
                        {f.type === "select" ? (
                          <select
                            value={draft[f.key as string] ?? ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          >
                            {(f.options ?? []).map((o) => <option key={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            value={draft[f.key as string] ?? ""}
                            inputMode={f.type === "number" ? "numeric" : undefined}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[var(--brand-color)] focus:outline-none"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              ))}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel">Notes</h4>
                <textarea
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[var(--brand-color)] focus:outline-none"
                />
              </section>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
              <button
                onClick={() => { onDelete(system.id); onClose(); }}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="ppl-btn ppl-btn--ghost">Cancel</button>
                <button disabled={saving} onClick={handleSave} className="ppl-btn ppl-btn--primary">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400" />;
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-12 rounded-lg border border-slate-200 bg-white px-2 py-1">
      <p className="text-[10px] font-semibold uppercase text-steel">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function InlineSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  );
}

function TierBadge({ tier }: { tier: string | null }) {
  return <span className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{tier || "Ungraded"}</span>;
}

function ScoreCell({ score }: { score: number | null }) {
  const value = score ?? 0;
  return (
    <div className="w-24">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">{value}</span>
        <span className="text-[10px] uppercase text-steel">score</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-[var(--brand-color)]" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

function Truncated({ value, width = "max-w-[220px]" }: { value: unknown; width?: string }) {
  return <div className={`${width} truncate`} title={String(value || "")}>{value ? String(value) : "-"}</div>;
}

function hasAssignment(row: SystemInventoryItem) {
  return Boolean(row.assigned_email || row.user_display);
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
}

function cleanPayload(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== "" && v !== undefined && v !== null));
}

function toNullableNumber(value: string | undefined) {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
