"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { pplDelete, pplGet, pplPatch, pplPost } from "../_lib/client";
import type { MeResponse } from "../_lib/types";
import { useOrgStore } from "../_lib/useOrgStore";
import type { DraftMove, GroupInfo, OrgPerson } from "../_lib/org-types";
import { OrgTree } from "./OrgTree";
import { PersonDrawer } from "./PersonDrawer";
import { DraftPanel } from "./DraftPanel";
import { PublishModal } from "./PublishModal";

export function OrgClient() {
  const store = useOrgStore();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [viewing, setViewing] = useState<OrgPerson | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [publishSlot, setPublishSlot] = useState<number | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [groupForm, setGroupForm] = useState({
    group_key: "",
    name: "",
    principal_name: "",
    team_lead_emp: "",
    parent_name: "",
    color_hex: "",
    sort_order: "0",
  });
  const [groupBusy, setGroupBusy] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    pplGet<MeResponse>("/auth/me").then(setMe).catch(() => {});
  }, []);

  const canEdit = me?.access_level === "edit" || me?.access_level === "admin";
  const isAdmin = me?.access_level === "admin";
  const principalNames = useMemo(() => store.tree.map((p) => p.name), [store.tree]);

  const loadGroups = () => {
    pplGet<GroupInfo[]>("/org/groups").then(setGroups).catch(() => {});
  };

  useEffect(() => {
    if (store.editMode && isAdmin) loadGroups();
  }, [store.editMode, isAdmin]);

  async function createGroup() {
    if (!groupForm.group_key.trim() || !groupForm.name.trim() || !groupForm.principal_name.trim()) return;
    setGroupBusy(true);
    try {
      await pplPost("/org/groups", cleanPayload({
        ...groupForm,
        sort_order: Number(groupForm.sort_order || 0),
        is_active: true,
      }));
      setGroupForm({
        group_key: "",
        name: "",
        principal_name: groupForm.principal_name,
        team_lead_emp: "",
        parent_name: "",
        color_hex: "",
        sort_order: "0",
      });
      loadGroups();
      store.reload();
    } finally {
      setGroupBusy(false);
    }
  }

  async function patchGroup(groupKey: string, body: Record<string, unknown>) {
    await pplPatch(`/org/groups/${encodeURIComponent(groupKey)}`, cleanPayload(body));
    loadGroups();
    store.reload();
  }

  async function deleteGroup(groupKey: string) {
    await pplDelete(`/org/groups/${encodeURIComponent(groupKey)}`);
    loadGroups();
    store.reload();
  }

  const movedEmps = useMemo(
    () => new Set(previewing ? store.pendingMoves.map((m) => m.empNo) : []),
    [previewing, store.pendingMoves],
  );
  const orgTotals = useMemo(() => {
    const principals = store.tree.length;
    const groups = store.tree.reduce((sum, p) => sum + p.group_count, 0);
    const people = store.tree.reduce((sum, p) => sum + p.employee_count, 0);
    const moved = store.pendingMoves.length;
    return { principals, groups, people, moved };
  }, [store.pendingMoves.length, store.tree]);

  // For the publish modal we need that slot's moves; we publish the *current*
  // pending set after the user saved it to a slot, so reuse pendingMoves.
  const publishMoves: DraftMove[] = store.pendingMoves;

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <div className="sticky top-[5.5rem] z-10 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-soft)] bg-white/85 px-4 py-3 shadow-[var(--shadow-soft)] backdrop-blur">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold text-[rgb(var(--ink))]">Org</h1>
              {store.editMode ? (
                <span className="rounded-full bg-[var(--brand-color)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--brand-color)]">
                  Edit mode
                </span>
              ) : (
                <span className="rounded-full bg-[rgb(var(--mist))] px-2.5 py-0.5 text-[11px] font-semibold text-[rgb(var(--steel))]">
                  {store.source === "live" ? "Live" : "Snapshot"}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-[rgb(var(--steel))]">
              {store.editMode
                ? "Drag people between teams, or use “Move to team” — changes collect in the rail on the right."
                : `${orgTotals.principals} principals · ${orgTotals.groups} groups · ${orgTotals.people} mapped`}
              {store.editMode && orgTotals.moved ? ` · ${orgTotals.moved} unsaved ${orgTotals.moved === 1 ? "change" : "changes"}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--steel))]">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people, teams…"
                className="w-56 rounded-lg border border-[var(--border-soft)] bg-white py-2 pl-8 pr-3 text-xs text-[rgb(var(--ink))] placeholder:text-[rgb(var(--steel))]/70 focus:border-[var(--brand-color)] focus:outline-none"
              />
            </div>
            <Link href="/people/org/changelog" className="ppl-btn ppl-btn--ghost">
              Change log
            </Link>
            {canEdit ? (
              <button
                onClick={() => {
                  if (store.editMode) setPreviewing(false);
                  store.setEditMode(!store.editMode);
                }}
                className={`ppl-btn ${store.editMode ? "ppl-btn--active" : "ppl-btn--primary"}`}
              >
                {store.editMode ? "Done editing" : "Edit org"}
              </button>
            ) : null}
          </div>
        </div>

        {store.editMode && isAdmin ? (
          <GroupMasterPanel
            groups={groups}
            principalNames={principalNames}
            form={groupForm}
            setForm={setGroupForm}
            busy={groupBusy}
            onCreate={createGroup}
            onPatch={patchGroup}
            onDelete={deleteGroup}
          />
        ) : null}

        {store.error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{store.error}</div> : null}
        {store.loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-400">Loading org chart…</div>
        ) : store.tree.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm font-medium text-slate-600">No org data yet.</p>
            <p className="mt-1 text-xs text-steel">Seed the principals and groups (migration 0023 + Org Data import) to populate the chart.</p>
          </div>
        ) : (
          <OrgTree
            principals={store.tree}
            groups={store.groups}
            editMode={store.editMode}
            movedEmps={movedEmps}
            query={query}
            onMove={(empNo, groupKey) => store.optimisticMove(empNo, { groupKey })}
            onView={setViewing}
          />
        )}
      </div>

      {/* Edit-mode sidebar */}
      <AnimatePresence>
        {store.editMode ? (
          <DraftPanel
            pendingMoves={store.pendingMoves}
            isAdmin={isAdmin}
            previewing={previewing}
            onPreview={() => setPreviewing((v) => !v)}
            onSaveDraft={store.saveDraft}
            onPublish={(slot) => setPublishSlot(slot)}
          />
        ) : null}
      </AnimatePresence>

      <PersonDrawer person={viewing} onClose={() => setViewing(null)} />
      <PublishModal
        slot={publishSlot}
        moves={publishMoves}
        onClose={() => setPublishSlot(null)}
        onConfirm={async (slot) => {
          await store.publish(slot);
          setPublishSlot(null);
          setPreviewing(false);
        }}
      />

      {/* Toast */}
      <AnimatePresence>
        {store.toast ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
          >
            {store.toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function GroupMasterPanel({
  groups,
  principalNames,
  form,
  setForm,
  busy,
  onCreate,
  onPatch,
  onDelete,
}: {
  groups: GroupInfo[];
  principalNames: string[];
  form: {
    group_key: string;
    name: string;
    principal_name: string;
    team_lead_emp: string;
    parent_name: string;
    color_hex: string;
    sort_order: string;
  };
  setForm: (value: {
    group_key: string;
    name: string;
    principal_name: string;
    team_lead_emp: string;
    parent_name: string;
    color_hex: string;
    sort_order: string;
  }) => void;
  busy: boolean;
  onCreate: () => Promise<void>;
  onPatch: (groupKey: string, body: Record<string, unknown>) => Promise<void>;
  onDelete: (groupKey: string) => Promise<void>;
}) {
  return (
    <details className="group mb-5 rounded-2xl border border-slate-200 bg-white shadow-sm [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-400 transition-transform group-open:rotate-90">
            <polyline points="9 6 15 12 9 18" />
          </svg>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Manage teams (admin)</h2>
            <p className="text-[11px] text-steel">{groups.length} groups across {principalNames.length} principals · click to edit</p>
          </div>
        </div>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 group-open:hidden">Open</span>
      </summary>

      <div className="border-t border-slate-100 p-4">
      <div className="mb-4 grid gap-2 lg:grid-cols-7">
        <SmallInput value={form.group_key} placeholder="group key" onChange={(v) => setForm({ ...form, group_key: v })} />
        <SmallInput value={form.name} placeholder="group name" onChange={(v) => setForm({ ...form, name: v })} />
        <select
          value={form.principal_name}
          onChange={(e) => setForm({ ...form, principal_name: e.target.value })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
        >
          <option value="">Principal</option>
          {principalNames.map((name) => <option key={name}>{name}</option>)}
        </select>
        <SmallInput value={form.team_lead_emp} placeholder="lead emp no" onChange={(v) => setForm({ ...form, team_lead_emp: v })} />
        <SmallInput value={form.parent_name} placeholder="parent" onChange={(v) => setForm({ ...form, parent_name: v })} />
        <SmallInput value={form.color_hex} placeholder="#color" onChange={(v) => setForm({ ...form, color_hex: v })} />
        <button disabled={busy} onClick={onCreate} className="ppl-btn ppl-btn--primary">Add group</button>
      </div>

      <div className="max-h-[320px] overflow-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            <tr>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Group</th>
              <th className="px-3 py-2">Principal</th>
              <th className="px-3 py-2">Lead</th>
              <th className="px-3 py-2">Color</th>
              <th className="px-3 py-2">Sort</th>
              <th className="px-3 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((group) => (
              <tr key={group.group_key} className={!group.is_active ? "bg-slate-50 text-slate-400" : "text-slate-700"}>
                <td className="px-3 py-2 font-semibold">{group.group_key}</td>
                <td className="px-3 py-2">
                  <InlineInput value={group.name} onSave={(name) => onPatch(group.group_key, { name })} />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={group.principal_name}
                    onChange={(e) => onPatch(group.group_key, { principal_name: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1"
                  >
                    {principalNames.map((name) => <option key={name}>{name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <InlineInput value={group.team_lead_emp || ""} onSave={(team_lead_emp) => onPatch(group.group_key, { team_lead_emp })} />
                </td>
                <td className="px-3 py-2">
                  <InlineInput value={group.color_hex || ""} onSave={(color_hex) => onPatch(group.group_key, { color_hex })} />
                </td>
                <td className="px-3 py-2">
                  <InlineInput value={String(group.sort_order)} onSave={(sort_order) => onPatch(group.group_key, { sort_order: Number(sort_order || 0) })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => group.is_active ? onDelete(group.group_key) : onPatch(group.group_key, { is_active: true })}
                    className={`rounded-lg border px-2 py-1 font-semibold ${group.is_active ? "border-red-200 text-red-700 hover:bg-red-50" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}
                  >
                    {group.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
            {!groups.length ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No groups loaded.</td></tr> : null}
          </tbody>
        </table>
      </div>
      </div>
    </details>
  );
}

function SmallInput({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  return <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400" />;
}

function InlineInput({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
      }}
      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 outline-none hover:border-slate-200 focus:border-[var(--brand-color)] focus:bg-white"
    />
  );
}

function cleanPayload(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== "" && v !== undefined && v !== null));
}
