"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { GroupInfo, OrgGroupNode, OrgPerson, OrgPrincipalNode } from "../_lib/org-types";
import { initialsFrom } from "../_lib/format";

/**
 * Top-down org chart (Darwin / classic org-chart style): a single Studio Lotus
 * root at the top, principals branching beneath it, then groups, then people —
 * each as its own node box, with connector lines branching downward.
 *
 * Levels expand on click (root + principals shown first) to keep the canvas
 * readable; the whole chart pans horizontally. Search auto-expands matches.
 */

const ROOT_LABEL = "Studio Lotus";
const ROOT_COLOR = "#E74011"; // brand lotus — single accent across the page

type NodeId = string; // "root" | principal name | `${principal}::${groupKey}`

export function OrgTree({
  principals,
  groups,
  editMode,
  movedEmps,
  query,
  onMove,
  onView,
}: {
  principals: OrgPrincipalNode[];
  groups: GroupInfo[];
  editMode: boolean;
  movedEmps: Set<string>;
  query: string;
  onMove: (empNo: string, groupKey: string) => void;
  onView: (person: OrgPerson) => void;
}) {
  // Active dnd-kit drag — the empNo currently being dragged (null when idle).
  const [activeEmp, setActiveEmp] = useState<string | null>(null);
  // Active move-menu person (only one open at a time).
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Drag uses a small activation distance so a click still opens the profile.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // Expanded node ids. Root + all principals start open so the chart isn't empty.
  const [expanded, setExpanded] = useState<Set<NodeId>>(() => new Set<NodeId>(["root"]));
  // The pannable canvas — used to auto-centre a node when it's expanded so the
  // user doesn't have to scroll left/right hunting for its children.
  const canvasRef = useRef<HTMLDivElement>(null);

  // After expand, smoothly bring the toggled node to the centre of the canvas.
  // We wait for the children's entrance animation (~0.16s) to settle so the
  // node's final position is known, then centre it horizontally and nudge it
  // up a little so its newly-revealed children sit in view below it.
  const centerNode = (id: NodeId) => {
    const run = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const el = canvas.querySelector<HTMLElement>(`[data-node-id="${cssEscape(id)}"]`);
      if (!el) return;
      const canvasRect = canvas.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetLeft =
        canvas.scrollLeft + (elRect.left - canvasRect.left) - canvasRect.width / 2 + elRect.width / 2;
      // Keep the node near the top third so its subtree is visible underneath.
      const targetTop =
        canvas.scrollTop + (elRect.top - canvasRect.top) - canvasRect.height * 0.28;
      canvas.scrollTo({ left: Math.max(0, targetLeft), top: Math.max(0, targetTop), behavior: "smooth" });
    };
    // One frame for React to paint the new children, then a short settle for
    // the framer-motion entrance to finish before measuring.
    requestAnimationFrame(() => setTimeout(run, 180));
  };

  // A principal must not report to themselves: drop the "Direct Reports" self
  // group (its only occupant is the principal) and recompute headcounts.
  const cleaned = useMemo(() => cleanPrincipals(principals), [principals]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => filterTree(cleaned, q), [cleaned, q]);

  // While searching, treat every node as expanded so matches are visible.
  const isOpen = (id: NodeId) => (q ? true : expanded.has(id));
  const toggle = (id: NodeId) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      const wasOpen = next.has(id);
      wasOpen ? next.delete(id) : next.add(id);
      // On expand, centre the node so its newly-revealed children land in view.
      if (!wasOpen) centerNode(id);
      return next;
    });

  const allIds = useMemo(() => {
    const ids: NodeId[] = ["root", ...cleaned.map((p) => p.name)];
    for (const p of cleaned) for (const g of p.groups) ids.push(`${p.name}::${g.key}`);
    return ids;
  }, [cleaned]);

  // Reset to just the root open whenever the underlying data changes (e.g. after
  // a publish/reload), so the initial view stays compact and centered.
  useEffect(() => {
    setExpanded(new Set<NodeId>(["root"]));
  }, [principals]);

  const expandAll = () => setExpanded(new Set(allIds));
  const collapseAll = () => setExpanded(new Set<NodeId>(["root"]));

  const totalPeople = cleaned.reduce((n, p) => n + p.employee_count, 0);
  const totalGroups = cleaned.reduce((n, p) => n + p.group_count, 0);

  // Flat empNo → person map so the drag overlay can render the dragged card.
  const peopleByEmp = useMemo(() => {
    const map = new Map<string, OrgPerson>();
    for (const p of cleaned) {
      for (const g of p.groups) {
        if (g.lead) map.set(g.lead.employee_no, g.lead);
        for (const m of g.members) map.set(m.employee_no, m);
      }
    }
    return map;
  }, [cleaned]);
  const activePerson = activeEmp ? peopleByEmp.get(activeEmp) ?? null : null;

  const onDragStart = (e: DragStartEvent) => {
    setActiveEmp(String(e.active.id));
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveEmp(null);
    const empNo = String(e.active.id);
    const groupKey = e.over?.data.current?.groupKey as string | undefined;
    const fromGroupKey = e.active.data.current?.groupKey as string | undefined;
    if (groupKey && groupKey !== fromGroupKey) onMove(empNo, groupKey);
  };

  if (!filtered.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
        No people match “{query}”.
      </div>
    );
  }

  const canvas = (
    <div
      ref={canvasRef}
      className="max-h-[calc(100vh-15rem)] overflow-auto bg-[rgb(var(--sand))]/40"
      style={{ backgroundImage: "radial-gradient(rgba(93,85,82,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
    >
      <div className="mx-auto flex w-max min-w-full justify-center px-6 py-12">
        <NodeShell
          nodeId="root"
          label={ROOT_LABEL}
          sub={`${cleaned.length} principals · ${totalGroups} groups · ${totalPeople} people`}
          color={ROOT_COLOR}
          kind="root"
          open={isOpen("root")}
          hasChildren={filtered.length > 0}
          onToggle={() => toggle("root")}
        >
          {isOpen("root") ? (
            <ChildrenRow>
              {filtered.map((p) => (
                <PrincipalNode
                  key={p.name}
                  principal={p}
                  groups={groups}
                  open={isOpen(p.name)}
                  isGroupOpen={(gk) => isOpen(`${p.name}::${gk}`)}
                  onToggle={() => toggle(p.name)}
                  onToggleGroup={(gk) => toggle(`${p.name}::${gk}`)}
                  editMode={editMode}
                  movedEmps={movedEmps}
                  activeEmp={activeEmp}
                  menuFor={menuFor}
                  setMenuFor={setMenuFor}
                  onMove={onMove}
                  onView={onView}
                />
              ))}
            </ChildrenRow>
          ) : null}
        </NodeShell>
      </div>
    </div>
  );

  return (
    <div className="ppl-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] bg-[rgb(var(--mist))]/60 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--steel))]">Organisation tree</p>
        <div className="flex items-center gap-1.5">
          <button onClick={expandAll} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-[rgb(var(--ink))] hover:bg-white">
            Expand all
          </button>
          <span className="text-[rgb(var(--steel))]/40">·</span>
          <button onClick={collapseAll} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-[rgb(var(--ink))] hover:bg-white">
            Collapse all
          </button>
        </div>
      </div>

      {/* In edit mode the canvas is a dnd-kit drop surface with auto-scroll while
          dragging; in view mode it's just a pannable canvas. */}
      {editMode ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveEmp(null)}>
          {canvas}
          <DragOverlay dropAnimation={null}>
            {activePerson ? <PersonDragCard person={activePerson} /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        canvas
      )}
    </div>
  );
}

function PrincipalNode({
  principal,
  groups,
  open,
  isGroupOpen,
  onToggle,
  onToggleGroup,
  editMode,
  movedEmps,
  activeEmp,
  menuFor,
  setMenuFor,
  onMove,
  onView,
}: {
  principal: OrgPrincipalNode;
  groups: GroupInfo[];
  open: boolean;
  isGroupOpen: (groupKey: string) => boolean;
  onToggle: () => void;
  onToggleGroup: (groupKey: string) => void;
  editMode: boolean;
  movedEmps: Set<string>;
  activeEmp: string | null;
  menuFor: string | null;
  setMenuFor: (v: string | null) => void;
  onMove: (empNo: string, groupKey: string) => void;
  onView: (person: OrgPerson) => void;
}) {
  const accent = principal.color || ROOT_COLOR;
  return (
    <NodeShell
      nodeId={principal.name}
      label={principal.name}
      sub={`${principal.group_count} ${principal.group_count === 1 ? "group" : "groups"} · ${principal.employee_count} ${principal.employee_count === 1 ? "person" : "people"}`}
      badge="Principal"
      color={accent}
      kind="principal"
      open={open}
      hasChildren={principal.groups.length > 0}
      onToggle={onToggle}
    >
      {open && principal.groups.length ? (
        <ChildrenRow>
          {principal.groups.map((g) => (
            <GroupNode
              key={g.key}
              nodeId={`${principal.name}::${g.key}`}
              group={g}
              groups={groups}
              accent={accent}
              open={isGroupOpen(g.key)}
              onToggle={() => onToggleGroup(g.key)}
              editMode={editMode}
              movedEmps={movedEmps}
              activeEmp={activeEmp}
              menuFor={menuFor}
              setMenuFor={setMenuFor}
              onMove={onMove}
              onView={onView}
            />
          ))}
        </ChildrenRow>
      ) : null}
    </NodeShell>
  );
}

function GroupNode({
  nodeId,
  group,
  groups,
  accent,
  open,
  onToggle,
  editMode,
  movedEmps,
  activeEmp,
  menuFor,
  setMenuFor,
  onMove,
  onView,
}: {
  nodeId: string;
  group: OrgGroupNode;
  groups: GroupInfo[];
  accent: string;
  open: boolean;
  onToggle: () => void;
  editMode: boolean;
  movedEmps: Set<string>;
  activeEmp: string | null;
  menuFor: string | null;
  setMenuFor: (v: string | null) => void;
  onMove: (empNo: string, groupKey: string) => void;
  onView: (person: OrgPerson) => void;
}) {
  const groupColor = group.color || accent;
  const people = [
    ...(group.lead ? [{ person: group.lead, isLead: true }] : []),
    ...group.members.map((m) => ({ person: m, isLead: false })),
  ];

  // The whole group (box + its open member area) is one drop zone, so you can
  // drop a person straight onto the visible members — not just the small box.
  const { setNodeRef, isOver } = useDroppable({
    id: `group:${group.key}`,
    data: { groupKey: group.key },
    disabled: !editMode,
  });
  // Don't highlight the source group as a drop target.
  const activeFromHere = activeEmp != null && people.some((p) => p.person.employee_no === activeEmp);
  const showDrop = editMode && isOver && !activeFromHere;

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl transition ${showDrop ? "ring-2 ring-[var(--brand-color)] ring-offset-2 bg-[var(--brand-color)]/[0.03]" : ""}`}
    >
      <NodeShell
        nodeId={nodeId}
        label={group.name}
        sub={`Lead: ${group.lead?.name || group.lead_name || "Not mapped"}`}
        count={people.length}
        color={groupColor}
        kind="group"
        open={open}
        hasChildren={people.length > 0}
        onToggle={onToggle}
        dropHint={showDrop ? "Drop to move here" : undefined}
      >
        {open && people.length ? (
          <MemberGrid>
            {people.map((entry) => (
              <PersonNode
                key={entry.person.employee_no}
                person={entry.person}
                isLead={entry.isLead}
                editMode={editMode}
                moved={movedEmps.has(entry.person.employee_no)}
                dragging={activeEmp === entry.person.employee_no}
                groups={groups}
                groupKey={group.key}
                menuOpen={menuFor === entry.person.employee_no}
                onOpenMenu={() => setMenuFor(menuFor === entry.person.employee_no ? null : entry.person.employee_no)}
                onMove={onMove}
                onView={onView}
              />
            ))}
          </MemberGrid>
        ) : null}
      </NodeShell>
    </div>
  );
}

function PersonNode({
  person,
  isLead,
  editMode,
  moved,
  dragging,
  groups,
  groupKey,
  menuOpen,
  onOpenMenu,
  onMove,
  onView,
}: {
  person: OrgPerson;
  isLead: boolean;
  editMode: boolean;
  moved: boolean;
  dragging: boolean;
  groups: GroupInfo[];
  groupKey: string;
  menuOpen: boolean;
  onOpenMenu: () => void;
  onMove: (empNo: string, groupKey: string) => void;
  onView: (person: OrgPerson) => void;
}) {
  // The card itself is the draggable; drag listeners live on a grip handle so a
  // plain click still opens the profile and the "Move to team" button works.
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: person.employee_no,
    data: { groupKey },
    disabled: !editMode,
  });

  return (
    <NodeColumn>
      <motion.div
        ref={setNodeRef}
        layout
        onClick={() => !editMode && onView(person)}
        animate={moved ? { boxShadow: ["0 0 0 0 rgba(231,64,17,0)", "0 0 0 3px rgba(231,64,17,0.4)", "0 0 0 0 rgba(231,64,17,0)"] } : {}}
        transition={moved ? { duration: 1.4, repeat: 2 } : { duration: 0.16 }}
        className={`relative ${dragging ? "opacity-30" : ""} ${editMode ? "" : "cursor-pointer hover:-translate-y-0.5"}`}
      >
        <PersonCardBody
          person={person}
          isLead={isLead}
          grip={
            editMode ? (
              <button
                type="button"
                {...attributes}
                {...listeners}
                onClick={(e) => e.stopPropagation()}
                title="Drag to move"
                className="absolute right-1 top-1.5 cursor-grab touch-none rounded p-1 text-[rgb(var(--steel))]/50 hover:bg-[rgb(var(--mist))] hover:text-[rgb(var(--steel))] active:cursor-grabbing"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                  <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                </svg>
              </button>
            ) : null
          }
          footerAction={
            editMode ? (
              <div className="border-t border-[var(--border-soft)] px-2 py-1.5">
                <MoveButton
                  groups={groups}
                  currentGroupKey={person.group_key}
                  open={menuOpen}
                  onToggle={onOpenMenu}
                  onPick={(gk) => {
                    onMove(person.employee_no, gk);
                    onOpenMenu();
                  }}
                />
              </div>
            ) : null
          }
        />
      </motion.div>
    </NodeColumn>
  );
}

/** The visual person card. Shared by the live node and the drag overlay. */
function PersonCardBody({
  person,
  isLead,
  grip,
  footerAction,
  elevated,
}: {
  person: OrgPerson;
  isLead: boolean;
  grip?: React.ReactNode;
  footerAction?: React.ReactNode;
  elevated?: boolean;
}) {
  const color = person.designation_color || "#707A87";
  return (
    <div
      className={`relative flex w-[184px] flex-col overflow-hidden rounded-xl border bg-white text-left transition ${
        isLead ? "border-[rgb(var(--steel))]/35" : "border-[var(--border-soft)]"
      } ${elevated ? "rotate-1 shadow-[var(--shadow-soft-hover)]" : "shadow-[var(--shadow-soft)]"}`}
    >
      {/* designation-color accent strip */}
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} aria-hidden />
      {grip}

      <div className="flex items-start gap-2 px-3 pb-2 pt-3.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white"
          style={{ backgroundColor: color }}
          title={person.designation_level || ""}
        >
          {initialsFrom(person.name, person.employee_no)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate text-[12.5px] font-semibold leading-tight text-[rgb(var(--ink))]">{person.name}</p>
            {isLead ? <span className="shrink-0 rounded bg-[rgb(var(--ink))] px-1 py-0.5 text-[7px] font-bold uppercase tracking-wide text-white">Lead</span> : null}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[10.5px] font-medium leading-snug text-[rgb(var(--steel))]">{person.title || "—"}</p>
          {person.designation_level ? (
            <span
              className="mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ backgroundColor: `${color}1A`, color }}
            >
              {person.designation_level}
            </span>
          ) : null}
        </div>
      </div>

      {/* experience + licence footer */}
      <div className="flex items-center gap-1.5 border-t border-[var(--border-soft)] bg-[rgb(var(--sand))]/50 px-2.5 py-1.5">
        <ExpChip label="SL" value={person.sl_exp_display} title="Studio Lotus tenure" />
        <ExpChip label="OE" value={person.o_exp_display} title="Overall experience" />
        {person.license_count > 0 ? (
          <span className="ml-auto rounded-md bg-[var(--brand-color)]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--brand-color)]" title="Licences assigned">
            {person.license_count} lic
          </span>
        ) : null}
      </div>

      {footerAction}
    </div>
  );
}

/** The card that follows the cursor while dragging (rendered in DragOverlay). */
function PersonDragCard({ person }: { person: OrgPerson }) {
  return (
    <div className="cursor-grabbing">
      <PersonCardBody person={person} isLead={false} elevated />
    </div>
  );
}

/**
 * Visible "Move to team" trigger + a searchable team picker. The picker is
 * rendered in a portal with fixed positioning anchored to the button, so it is
 * never clipped by the scrollable org canvas, and flips above/below depending
 * on available space.
 */
function MoveButton({
  groups,
  currentGroupKey,
  open,
  onToggle,
  onPick,
}: {
  groups: GroupInfo[];
  currentGroupKey: string;
  open: boolean;
  onToggle: () => void;
  onPick: (groupKey: string) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition ${
          open
            ? "bg-[var(--brand-color)] text-white"
            : "bg-[var(--brand-color)]/10 text-[var(--brand-color)] hover:bg-[var(--brand-color)]/20"
        }`}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
        Move to team
      </button>
      {open ? (
        <MovePickerPortal
          anchorRef={btnRef}
          groups={groups}
          currentGroupKey={currentGroupKey}
          onPick={onPick}
          onClose={onToggle}
        />
      ) : null}
    </>
  );
}

/** Fixed-positioned, portalled team picker. Never clipped by the org canvas. */
function MovePickerPortal({
  anchorRef,
  groups,
  currentGroupKey,
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement>;
  groups: GroupInfo[];
  currentGroupKey: string;
  onPick: (groupKey: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number; placement: "above" | "below" } | null>(null);

  const PANEL_W = 240;
  const PANEL_MAX_H = 300;

  // Position the panel next to the trigger using viewport coordinates, flipping
  // above the button when there isn't room below.
  useLayoutEffect(() => {
    const place = () => {
      const btn = anchorRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const placement: "above" | "below" = spaceBelow < PANEL_MAX_H + 12 && r.top > spaceBelow ? "above" : "below";
      let left = r.left + r.width / 2 - PANEL_W / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - PANEL_W - 8));
      const top = placement === "below" ? r.bottom + 6 : r.top - 6;
      setPos({ left, top, placement });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef]);

  const active = groups.filter((g) => g.is_active);
  const shown = q.trim()
    ? active.filter((g) => `${g.name} ${g.principal_name}`.toLowerCase().includes(q.trim().toLowerCase()))
    : active;

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* click-away backdrop */}
      <button
        type="button"
        className="fixed inset-0 z-[90] cursor-default"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
      />
      <div
        className="fixed z-[95] w-60 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-white shadow-[var(--shadow-soft-hover)]"
        style={
          pos
            ? {
                left: pos.left,
                top: pos.placement === "below" ? pos.top : undefined,
                bottom: pos.placement === "above" ? window.innerHeight - pos.top : undefined,
                visibility: "visible",
              }
            : { visibility: "hidden" }
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border-soft)] p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a team…"
            className="w-full rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--brand-color)]"
          />
        </div>
        <div className="max-h-56 overflow-auto py-1">
          {shown.map((g) => {
            const isCurrent = g.group_key === currentGroupKey;
            return (
              <button
                key={g.group_key}
                type="button"
                disabled={isCurrent}
                onClick={() => onPick(g.group_key)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${
                  isCurrent ? "cursor-default text-slate-300" : "text-[rgb(var(--ink))] hover:bg-[rgb(var(--mist))]"
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.color_hex || "#94a3b8" }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{g.name}</span>
                  <span className="block truncate text-[10px] text-[rgb(var(--steel))]">{g.principal_name}</span>
                </span>
                {isCurrent ? <span className="text-[9px] font-semibold uppercase text-[rgb(var(--steel))]">Here</span> : null}
              </button>
            );
          })}
          {!shown.length ? <p className="px-3 py-3 text-center text-[11px] text-[rgb(var(--steel))]">No teams match.</p> : null}
        </div>
      </div>
    </>,
    document.body,
  );
}

function ExpChip({ label, value, title }: { label: string; value: string; title: string }) {
  const empty = !value || value === "—";
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9.5px] tabular-nums"
    >
      <span className="font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={empty ? "text-slate-300" : "font-semibold text-slate-700"}>{empty ? "—" : value.replace(" yrs", "y")}</span>
    </span>
  );
}

// ── chart primitives ─────────────────────────────────────────────────────────

/**
 * A node = its own box on top, and (when open) a connector stub down into a row
 * of children. NodeShell renders the box + downward line; ChildrenRow renders
 * the horizontal connector bus and the children columns.
 */
function NodeShell({
  nodeId,
  label,
  sub,
  badge,
  count,
  color,
  kind,
  open,
  hasChildren,
  onToggle,
  dropHint,
  children,
}: {
  nodeId?: string;
  label: string;
  sub?: string;
  badge?: string;
  count?: number;
  color: string;
  kind: "root" | "principal" | "group";
  open: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  dropHint?: string;
  children?: React.ReactNode;
}) {
  const width = kind === "root" ? "min-w-[200px]" : kind === "principal" ? "min-w-[176px]" : "min-w-[164px]";
  const isRoot = kind === "root";
  return (
    <NodeColumn>
      <button
        type="button"
        data-node-id={nodeId}
        onClick={onToggle}
        className={`group relative flex ${width} items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
          dropHint
            ? "border-[var(--brand-color)] bg-[var(--brand-color)]/5 shadow-[var(--shadow-soft-hover)]"
            : isRoot
            ? "border-transparent text-white shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-soft-hover)]"
            : "border-[var(--border-soft)] bg-white shadow-[var(--shadow-soft)] hover:border-[rgb(var(--steel))]/30 hover:shadow-[var(--shadow-soft-hover)]"
        }`}
        style={isRoot && !dropHint ? { backgroundColor: color } : undefined}
      >
        {dropHint ? (
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--brand-color)] px-2 py-0.5 text-[10px] font-semibold text-white shadow">
            {dropHint}
          </span>
        ) : null}
        {/* structural marker: small color dot for groups, initials puck otherwise */}
        {kind === "group" ? (
          <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        ) : (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
            style={{ backgroundColor: isRoot ? "rgba(255,255,255,0.2)" : color }}
          >
            {initialsFrom(label, label)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[13px] font-semibold ${isRoot ? "text-white" : "text-[rgb(var(--ink))]"}`}>{label}</p>
          {sub ? <p className={`truncate text-[10.5px] ${isRoot ? "text-white/80" : "text-[rgb(var(--steel))]"}`}>{sub}</p> : null}
        </div>
        {badge ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${isRoot ? "" : "border"}`}
            style={isRoot ? { backgroundColor: "rgba(255,255,255,0.18)", color: "white" } : { borderColor: `${color}40`, color }}
          >
            {badge}
          </span>
        ) : null}
        {count != null ? (
          <span className="shrink-0 rounded-md bg-[rgb(var(--mist))] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[rgb(var(--steel))]">{count}</span>
        ) : null}
        {hasChildren ? (
          <span className={`shrink-0 text-[9px] ${isRoot ? "text-white/70" : "text-[rgb(var(--steel))]/60"}`}>{open ? "▾" : "▸"}</span>
        ) : null}
      </button>

      {/* downward stub from this node to the connector bus below */}
      {open && hasChildren ? <span className="h-5 w-px bg-[rgb(var(--steel))]/25" aria-hidden /> : null}

      {children}
    </NodeColumn>
  );
}

/** A horizontal row of child node-columns with a connector bus across the top. */
function ChildrenRow({ children }: { children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <AnimatePresence initial={false}>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.16 }}
        className="flex items-start"
      >
        {items.map((child, i) => (
          <div key={i} className="relative flex flex-col items-center px-2.5">
            {/* connector bus: top horizontal line + drop into the child */}
            {items.length > 1 ? (
              <span
                className="absolute top-0 h-px bg-[rgb(var(--steel))]/25"
                style={{ left: i === 0 ? "50%" : 0, right: i === items.length - 1 ? "50%" : 0 }}
                aria-hidden
              />
            ) : null}
            <span className="h-5 w-px bg-[rgb(var(--steel))]/25" aria-hidden />
            {child}
          </div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Member layout for an open team: a wrapping grid (not one ever-widening row),
 * so large teams stay fully visible inside the canvas. Width is capped at a few
 * cards across and the grid centres under its group box.
 */
function MemberGrid({ children }: { children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <>
      {/* connector stub from the group box down into the member grid */}
      <span className="h-5 w-px bg-[rgb(var(--steel))]/25" aria-hidden />
      <AnimatePresence initial={false}>
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
          className="grid max-w-[616px] justify-center gap-3 px-2"
          style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, 184px)` }}
        >
          {items}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

/** A vertically-stacked, center-aligned node column (box + its subtree). */
function NodeColumn({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center">{children}</div>;
}

/** Escape a node id for use inside a [data-node-id="…"] attribute selector. */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

// ── cleaning ──────────────────────────────────────────────────────────────────

/** Name → lowercase tokens, punctuation stripped (e.g. "Ambrish - Arora" → ["ambrish","arora"]). */
function nameTokens(name: string | null | undefined): string[] {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Same person by first + last name token (tolerates dashes and inserted middle names). */
function sameFirstLast(name: string | null | undefined, other: string | null | undefined): boolean {
  const a = nameTokens(name);
  const b = nameTokens(other);
  if (!a.length || !b.length) return false;
  return a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
}

/**
 * A principal cannot report to themselves. The seed data gives each principal a
 * "Direct Reports" group whose only occupant is the principal — often with a
 * slightly different spelling ("Ambrish - Arora" vs "Ambrish Arora", or an
 * inserted middle name "Ankur Pradeep Choksi" vs "Ankur Choksi") — so the
 * backend's exact-name dedupe misses it. Here we drop the principal-self person
 * wherever they appear, remove any group left empty, and recount.
 */
function cleanPrincipals(principals: OrgPrincipalNode[]): OrgPrincipalNode[] {
  return principals.map((p) => {
    const selfEmp = p.employee_no;
    const isSelf = (person: OrgPerson | null) =>
      !!person && ((selfEmp != null && person.employee_no === selfEmp) || sameFirstLast(person.name, p.name));

    const groups: OrgGroupNode[] = [];
    for (const g of p.groups) {
      const lead = isSelf(g.lead) ? null : g.lead;
      const members = g.members.filter((m) => !isSelf(m));
      // Drop a group that only ever held the principal themselves.
      if (!lead && members.length === 0) continue;
      groups.push({ ...g, lead, members });
    }

    const employee_count = groups.reduce((n, g) => n + (g.lead ? 1 : 0) + g.members.length, 0);
    return { ...p, groups, group_count: groups.length, employee_count };
  });
}

// ── filtering ─────────────────────────────────────────────────────────────────

function personMatches(p: OrgPerson, q: string): boolean {
  return (
    p.name.toLowerCase().includes(q) ||
    (p.title || "").toLowerCase().includes(q) ||
    (p.designation_level || "").toLowerCase().includes(q) ||
    p.employee_no.toLowerCase().includes(q) ||
    (p.email || "").toLowerCase().includes(q)
  );
}

function filterTree(principals: OrgPrincipalNode[], q: string): OrgPrincipalNode[] {
  if (!q) return principals;
  const out: OrgPrincipalNode[] = [];
  for (const p of principals) {
    const principalHit = p.name.toLowerCase().includes(q);
    const groups: OrgGroupNode[] = [];
    for (const g of p.groups) {
      const groupHit = g.name.toLowerCase().includes(q) || (g.lead_name || "").toLowerCase().includes(q);
      if (principalHit || groupHit) {
        groups.push(g);
        continue;
      }
      const lead = g.lead && personMatches(g.lead, q) ? g.lead : null;
      const members = g.members.filter((m) => personMatches(m, q));
      if (lead || members.length) groups.push({ ...g, lead, members });
    }
    if (principalHit || groups.length) out.push({ ...p, groups });
  }
  return out;
}
