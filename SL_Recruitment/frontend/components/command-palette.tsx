"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Command } from "lucide-react";
import type { CandidateListItem, OpeningListItem } from "@/lib/types";
import { fetchDeduped } from "@/lib/fetch-deduped";
import { useToast } from "@/components/ui/toast-provider";

type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  href: string;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [openings, setOpenings] = useState<OpeningListItem[]>([]);
  const { pushToast } = useToast();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [candidateRes, openingRes] = await Promise.all([
          fetchDeduped("/api/rec/candidates?limit=120", { cache: "no-store" }),
          fetchDeduped("/api/rec/openings", { cache: "no-store" }),
        ]);
        if (!cancelled && candidateRes.ok) {
          setCandidates((await candidateRes.json()) as CandidateListItem[]);
        }
        if (!cancelled && openingRes.ok) {
          setOpenings((await openingRes.json()) as OpeningListItem[]);
        }
      } catch {
        if (!cancelled) {
          pushToast({
            tone: "warning",
            title: "Command data unavailable",
            description: "Could not refresh candidates/openings right now.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, pushToast]);

  const staticItems: PaletteItem[] = useMemo(
    () => [
      { id: "go-dashboard", label: "Go to Dashboard", href: "/dashboard", hint: "Recruitment home" },
      { id: "go-candidates", label: "Go to Candidates", href: "/candidates", hint: "Pipeline list" },
      { id: "go-openings", label: "Go to Openings", href: "/openings", hint: "Role inventory" },
      { id: "go-offers", label: "Go to Offers", href: "/offers", hint: "Offer lifecycle" },
      { id: "go-reports", label: "Go to Reports", href: "/reports", hint: "Analytics and exports" },
    ],
    []
  );

  const trimmed = query.trim().toLowerCase();
  const resultItems = useMemo(() => {
    const items: PaletteItem[] = [];
    items.push(...staticItems);

    for (const opening of openings.slice(0, 80)) {
      const label = opening.title || opening.opening_code || `Opening ${opening.opening_id}`;
      items.push({
        id: `opening-${opening.opening_id}`,
        label: `Opening: ${label}`,
        hint: opening.opening_code || `ID ${opening.opening_id}`,
        href: `/candidates?status_view=all&opening_id=${opening.opening_id}`,
      });
    }

    for (const candidate of candidates.slice(0, 120)) {
      items.push({
        id: `candidate-${candidate.candidate_id}`,
        label: `Candidate: ${candidate.name}`,
        hint: `${candidate.candidate_code} · ${candidate.current_stage || "stage n/a"}`,
        href: `/candidates/${candidate.candidate_id}`,
      });
    }

    if (!trimmed) return items.slice(0, 20);
    return items
      .filter((item) => `${item.label} ${item.hint || ""}`.toLowerCase().includes(trimmed))
      .slice(0, 20);
  }, [candidates, openings, staticItems, trimmed]);

  function navigate(href: string) {
    setOpen(false);
    setQuery("");
    const target = href.startsWith("/") ? `${basePath}${href}` : href;
    window.location.href = target;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[350] hidden items-center gap-2 rounded-full border border-slate-300 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white md:inline-flex"
        title="Open command palette"
      >
        <Command className="h-4 w-4" />
        Quick jump
      </button>

      {!open ? null : (
        <div className="fixed inset-0 z-[360] flex items-start justify-center bg-black/30 px-4 pt-[14vh]">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_70px_-30px_rgba(15,23,42,0.65)]">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search candidates, openings, or actions..."
                className="w-full bg-transparent py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                autoFocus
              />
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
                Ctrl/Cmd+K
              </span>
            </div>

            <div className="max-h-[58vh] overflow-y-auto p-2">
              {loading && resultItems.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500">Loading command data...</p>
              ) : resultItems.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500">No matching result.</p>
              ) : (
                resultItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.href)}
                    className="flex w-full items-start justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{item.label}</span>
                      {item.hint ? <span className="block truncate text-xs text-slate-500">{item.hint}</span> : null}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Open</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
