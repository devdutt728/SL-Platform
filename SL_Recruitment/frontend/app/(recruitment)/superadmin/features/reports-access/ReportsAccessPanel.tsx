"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Search, ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import type { PlatformPersonSuggestion, ReportsAccessAssignment } from "@/lib/types";

const featureOptions = [
  { code: "recruitment_app", label: "Recruitment" },
  { code: "planner_app", label: "Project Planner" },
  { code: "reports", label: "Reports" },
];

export function ReportsAccessPanel() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  const [assignments, setAssignments] = useState<ReportsAccessAssignment[]>([]);
  const [selectedFeature, setSelectedFeature] = useState("recruitment_app");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [personQuery, setPersonQuery] = useState("");
  const [personOptions, setPersonOptions] = useState<PlatformPersonSuggestion[]>([]);
  const [personSelected, setPersonSelected] = useState<PlatformPersonSuggestion | null>(null);
  const [personOpen, setPersonOpen] = useState(false);
  const [personLoading, setPersonLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const personMenuRef = useRef<HTMLDivElement | null>(null);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/platform/feature-access/${encodeURIComponent(selectedFeature)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ReportsAccessAssignment[];
      setAssignments(data || []);
    } catch (e: any) {
      setError(e?.message || "Could not load feature access.");
    } finally {
      setLoading(false);
    }
  }, [basePath, selectedFeature]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    let cancelled = false;
    const q = personQuery.trim();
    if (!personOpen) return;

    const handle = window.setTimeout(() => {
      (async () => {
        setPersonLoading(true);
        try {
          const res = await fetch(`${basePath}/api/platform/people?q=${encodeURIComponent(q)}&limit=10`, {
            cache: "no-store",
          });
          if (!res.ok) return;
          const data = (await res.json()) as PlatformPersonSuggestion[];
          if (!cancelled) setPersonOptions(data);
        } catch {
          // Keep the picker usable even when search fails temporarily.
        } finally {
          if (!cancelled) setPersonLoading(false);
        }
      })();
    }, q.length < 2 ? 0 : 200);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [basePath, personOpen, personQuery]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, ReportsAccessAssignment>();
    assignments.forEach((assignment) => {
      map.set(assignment.person_id, assignment);
    });
    return map;
  }, [assignments]);

  useEffect(() => {
    if (!personSelected) {
      setEnabled(false);
      return;
    }
    setEnabled(Boolean(assignmentMap.get(personSelected.person_id)?.enabled));
  }, [assignmentMap, personSelected]);

  async function saveAccess(
    nextEnabled: boolean,
    selectedPerson?: Pick<PlatformPersonSuggestion, "person_id"> | Pick<ReportsAccessAssignment, "person_id"> | null
  ) {
    const target = selectedPerson || personSelected;
    if (!target) {
      setError("Select a person first.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `${basePath}/api/platform/feature-access/${encodeURIComponent(selectedFeature)}/${encodeURIComponent(target.person_id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: nextEnabled }),
        }
      );
      if (!res.ok) throw new Error(await res.text());

      await loadAssignments();
      setEnabled(nextEnabled);
      const featureLabel = featureOptions.find((option) => option.code === selectedFeature)?.label || "Feature";
      setNotice(nextEnabled ? `${featureLabel} access granted.` : `${featureLabel} access removed.`);
      window.setTimeout(() => setNotice(null), 2200);
    } catch (e: any) {
      setError(e?.message || "Could not update feature access.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="content-pad mt-3 space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-100/70 p-5 shadow-[0_22px_40px_-34px_rgba(15,23,42,0.58)]">
        <div className="absolute -right-10 top-6 h-40 w-40 rounded-full bg-amber-200/35 blur-3xl" aria-hidden="true" />
        <div className="absolute -left-8 bottom-6 h-28 w-28 rounded-full bg-cyan-200/35 blur-2xl" aria-hidden="true" />
        <div className="relative space-y-2">
          <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Admin</p>
          <h1 className="text-xl font-semibold text-slate-900">App Access</h1>
          <p className="max-w-2xl text-xs text-slate-600">
            Recruitment, Project Planner, and Reports are grant-driven. Superadmin keeps global access; everyone else needs an explicit assignment here.
          </p>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-3xl border border-slate-200/80 bg-white/85 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-tight text-slate-500">Grant access</p>
              <h2 className="text-lg font-semibold text-slate-900">Person visibility</h2>
            </div>
            <ShieldCheck className="h-4 w-4 text-slate-500" />
          </div>

          <div className="mt-4 space-y-3">
            <label className="space-y-1 text-xs text-slate-600">
              Feature
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                value={selectedFeature}
                onChange={(e) => {
                  setSelectedFeature(e.target.value);
                  setPersonSelected(null);
                  setPersonQuery("");
                }}
              >
                {featureOptions.map((feature) => (
                  <option key={feature.code} value={feature.code}>
                    {feature.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              Person
              <div className="relative" ref={personMenuRef}>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={personSelected ? `${personSelected.full_name} (${personSelected.email})` : personQuery}
                  onChange={(e) => {
                    setPersonSelected(null);
                    setPersonQuery(e.target.value);
                  }}
                  onFocus={() => setPersonOpen(true)}
                  onBlur={() => window.setTimeout(() => setPersonOpen(false), 150)}
                  placeholder="Search by name or email"
                />
                {personLoading ? (
                  <div className="absolute right-3 top-2 text-xs text-slate-400">Searching...</div>
                ) : (
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-300" />
                )}
                {!personSelected && personOpen && personOptions.length > 0 ? (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
                    {personOptions.map((person) => {
                      const alreadyEnabled = Boolean(assignmentMap.get(person.person_id)?.enabled);
                      return (
                        <button
                          key={person.person_id}
                          type="button"
                          className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onClick={() => {
                            setPersonSelected(person);
                            setPersonOptions([]);
                            setEnabled(alreadyEnabled);
                          }}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {person.full_name} <span className="text-slate-500">({person.email})</span>
                            </span>
                            <span className="block truncate text-xs text-slate-400">
                              {alreadyEnabled ? "Feature access already enabled" : person.person_id}
                            </span>
                          </span>
                          {alreadyEnabled ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={!personSelected || saving}
              />
              <span>
                <span className="block font-medium text-slate-900">Allow feature visibility</span>
                <span className="block text-xs text-slate-500">This controls app visibility and protected APIs for the selected user.</span>
              </span>
            </label>

            <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-3 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Superadmin does not need an explicit assignment here. This panel is for non-superadmin users.</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void saveAccess(enabled)}
              disabled={!personSelected || saving}
              className="w-full rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save access"}
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/80 bg-white/85 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-tight text-slate-500">Current access</p>
              <h2 className="text-lg font-semibold text-slate-900">Allowed users</h2>
            </div>
            <UserRoundCheck className="h-4 w-4 text-slate-500" />
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            {loading ? (
              <div className="px-4 py-4 text-sm text-slate-600">Loading access assignments...</div>
            ) : assignments.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-600">No explicit access has been granted for this feature yet.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {assignments.map((assignment) => (
                  <div key={assignment.person_id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {assignment.full_name}
                        {assignment.is_deleted ? <span className="ml-2 text-xs font-medium text-rose-600">Deleted</span> : null}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {assignment.email}
                        {assignment.person_code ? ` · ${assignment.person_code}` : ""}
                        {assignment.status ? ` · ${assignment.status}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveAccess(false, assignment)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <UserRoundX className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
