"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pplGet, pplPost, pplPut } from "./client";
import type { DraftMove, DraftState, GroupInfo, OrgLive, OrgPerson, OrgPrincipalNode } from "./org-types";

// Deep-clone the principals tree (structuredClone is available in modern runtimes).
function clone<T>(v: T): T {
  return typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

interface MoveTarget {
  groupKey: string;
}

export function useOrgStore() {
  const [tree, setTree] = useState<OrgPrincipalNode[]>([]);
  const [baseline, setBaseline] = useState<OrgPrincipalNode[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [source, setSource] = useState<"snapshot" | "live">("live");
  const [toast, setToast] = useState<string | null>(null);

  // pendingMoves: empNo -> {from..., to...} relative to the published baseline.
  const [pendingMoves, setPendingMoves] = useState<Record<string, DraftMove>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [live, grps] = await Promise.all([
        pplGet<OrgLive>("/org/live"),
        pplGet<GroupInfo[]>("/org/groups"),
      ]);
      setTree(live.principals);
      setBaseline(clone(live.principals));
      setSource(live.source);
      setGroups(grps);
      setPendingMoves({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  // Locate a person across the tree.
  const findPerson = useCallback(
    (treeState: OrgPrincipalNode[], empNo: string): OrgPerson | null => {
      for (const p of treeState) {
        for (const g of p.groups) {
          if (g.lead?.employee_no === empNo) return g.lead;
          const m = g.members.find((x) => x.employee_no === empNo);
          if (m) return m;
        }
      }
      return null;
    },
    [],
  );

  // Optimistic move — instant local state update + debounced server write.
  const optimisticMove = useCallback(
    (empNo: string, target: MoveTarget) => {
      const group = groups.find((g) => g.group_key === target.groupKey);
      if (!group) return;

      setTree((prev) => {
        const next = clone(prev);
        // remove person from current group
        let moved: OrgPerson | null = null;
        for (const p of next) {
          for (const g of p.groups) {
            const idx = g.members.findIndex((x) => x.employee_no === empNo);
            if (idx >= 0) {
              moved = g.members.splice(idx, 1)[0];
              break;
            }
            if (g.lead?.employee_no === empNo) {
              moved = g.lead;
              g.lead = null;
              break;
            }
          }
          if (moved) break;
        }
        if (!moved) return prev;
        moved.group_key = group.group_key;
        moved.group_name = group.name;
        moved.principal = group.principal_name;
        // insert into target group (create node under its principal if needed)
        const principal = next.find((p) => p.name === group.principal_name);
        if (!principal) return prev;
        let gnode = principal.groups.find((g) => g.key === group.group_key);
        if (!gnode) {
          gnode = {
            key: group.group_key, name: group.name, principal: group.principal_name,
            lead_name: group.team_lead_emp, lead: null, color: group.color_hex, sort: group.sort_order, members: [],
          };
          principal.groups.push(gnode);
        }
        gnode.members.push(moved);
        gnode.members.sort((a, b) => (a.designation_order ?? 99) - (b.designation_order ?? 99) || a.name.localeCompare(b.name));
        return next;
      });

      // Update the pending-moves queue relative to baseline.
      setPendingMoves((prev) => {
        const basePerson = findPerson(baseline, empNo);
        const next = { ...prev };
        if (basePerson && basePerson.group_key === target.groupKey) {
          delete next[empNo]; // moved back to original group — no net change
        } else {
          next[empNo] = {
            empNo,
            name: basePerson?.name || empNo,
            fromGroupKey: basePerson?.group_key ?? null,
            fromPrincipal: basePerson?.principal ?? null,
            toGroupKey: group.group_key,
            toPrincipal: group.principal_name,
          };
        }
        return next;
      });

      // Debounced server write (250ms, per Console.html).
      if (debounceTimers.current[empNo]) clearTimeout(debounceTimers.current[empNo]);
      debounceTimers.current[empNo] = setTimeout(async () => {
        try {
          await pplPost("/org/move", { empNo, newGroupKey: target.groupKey });
        } catch (e) {
          showToast(`Move failed: ${(e as Error).message}. Reloading…`);
          reload();
        }
      }, 250);
    },
    [groups, baseline, findPerson, reload, showToast],
  );

  const pendingList = useMemo(() => Object.values(pendingMoves), [pendingMoves]);

  const buildSnapshot = useCallback(() => ({ principals: clone(tree), generated_at: new Date().toISOString() }), [tree]);

  const saveDraft = useCallback(
    async (slot: number, name: string) => {
      await pplPut<DraftState>(`/org/drafts/${slot}`, {
        draft_name: name,
        moves_json: pendingList,
        full_snapshot: buildSnapshot(),
      });
      showToast(`Saved to draft slot ${slot}.`);
    },
    [pendingList, buildSnapshot, showToast],
  );

  const publish = useCallback(
    async (slot: number) => {
      await pplPost(`/org/publish/${slot}`, { confirm: true });
      showToast("Published. Org chart updated.");
      await reload();
      setEditMode(false);
    },
    [reload, showToast],
  );

  return {
    tree, baseline, groups, loading, error, editMode, source, toast,
    pendingMoves: pendingList, pendingCount: pendingList.length,
    setEditMode, optimisticMove, reload, saveDraft, publish, showToast,
  };
}
