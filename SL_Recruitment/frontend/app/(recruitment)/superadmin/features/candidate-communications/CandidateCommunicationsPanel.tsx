"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { BASIC_DETAILS_FORM_LABEL, CANDIDATE_ASSESSMENT_FORM_LABEL } from "@/lib/recruitment-terms";
import type { CandidateCommunicationFeed, CandidateCommunicationItem } from "@/lib/types";

const PAGE_SIZE = 100;

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "email_sent", label: "Emails sent" },
  { value: "basic_details_form_link_generated", label: `${BASIC_DETAILS_FORM_LABEL} links generated` },
  { value: "candidate_assessment_form_link_generated", label: `${CANDIDATE_ASSESSMENT_FORM_LABEL} links generated` },
];

const KNOWN_EMAIL_TYPES = [
  "application_links",
  "assessment_link",
  "interview_scheduled",
  "interview_slot_options",
  "interview_cancelled",
  "interview_rescheduled",
  "sprint_assigned",
  "offer_sent",
  "joining_documents_request",
  "offer_approval_request_principal",
  "offer_approval_decision_hr",
  "caf_reminder",
  "sprint_reminder",
  "sprint_overdue",
  "offer_followup",
];

type CandidateCommunicationCandidateRow = {
  candidate_id: number;
  candidate_code: string;
  candidate_name: string;
  candidate_email?: string | null;
  opening_title?: string | null;
  latest_created_at?: string | null;
  latest_action_type?: string | null;
  latest_email_type?: string | null;
  latest_status?: string | null;
  event_count: number;
  links: CandidateCommunicationItem["links"];
};

function formatDateTime(raw?: string | null) {
  if (!raw) return "-";
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) return raw;
  return value.toLocaleString();
}

function statusTone(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "sent") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "skipped") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function toTimeValue(raw?: string | null) {
  if (!raw) return Number.NEGATIVE_INFINITY;
  const value = new Date(raw).getTime();
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

function aggregateCandidateRows(items: CandidateCommunicationItem[]): CandidateCommunicationCandidateRow[] {
  const grouped = new Map<
    number,
    CandidateCommunicationCandidateRow & {
      linkKeys: Set<string>;
    }
  >();

  for (const item of items) {
    const existing = grouped.get(item.candidate_id);
    if (!existing) {
      const linkKeys = new Set<string>();
      const links: CandidateCommunicationItem["links"] = [];
      for (const link of item.links) {
        const key = `${link.label}::${link.url}`;
        if (!link.url || linkKeys.has(key)) continue;
        linkKeys.add(key);
        links.push(link);
      }
      grouped.set(item.candidate_id, {
        candidate_id: item.candidate_id,
        candidate_code: item.candidate_code,
        candidate_name: item.candidate_name,
        candidate_email: item.candidate_email,
        opening_title: item.opening_title,
        latest_created_at: item.created_at,
        latest_action_type: item.action_type,
        latest_email_type: item.email_type,
        latest_status: item.status,
        event_count: 1,
        links,
        linkKeys,
      });
      continue;
    }

    existing.event_count += 1;
    if (!existing.candidate_email && item.candidate_email) existing.candidate_email = item.candidate_email;
    if (!existing.opening_title && item.opening_title) existing.opening_title = item.opening_title;
    if (toTimeValue(item.created_at) > toTimeValue(existing.latest_created_at)) {
      existing.latest_created_at = item.created_at;
      existing.latest_action_type = item.action_type;
      existing.latest_email_type = item.email_type;
      existing.latest_status = item.status;
    }
    for (const link of item.links) {
      const key = `${link.label}::${link.url}`;
      if (!link.url || existing.linkKeys.has(key)) continue;
      existing.linkKeys.add(key);
      existing.links.push(link);
    }
  }

  return Array.from(grouped.values())
    .map((row) => ({
      candidate_id: row.candidate_id,
      candidate_code: row.candidate_code,
      candidate_name: row.candidate_name,
      candidate_email: row.candidate_email,
      opening_title: row.opening_title,
      latest_created_at: row.latest_created_at,
      latest_action_type: row.latest_action_type,
      latest_email_type: row.latest_email_type,
      latest_status: row.latest_status,
      event_count: row.event_count,
      links: row.links,
    }))
    .sort((a, b) => toTimeValue(b.latest_created_at) - toTimeValue(a.latest_created_at));
}

export function CandidateCommunicationsPanel() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [actionType, setActionType] = useState("");
  const [emailType, setEmailType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<CandidateCommunicationFeed | null>(null);

  const loadFeed = useCallback(
    async (nextOffset: number, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(nextOffset));
        if (query.trim()) params.set("q", query.trim());
        if (actionType) params.set("action_type", actionType);
        if (emailType.trim()) params.set("email_type", emailType.trim());
        const res = await fetch(`${basePath}/api/rec/candidates/communications?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as CandidateCommunicationFeed;
        setFeed((prev) => {
          if (!append || !prev) return data;
          const mergedItems = [...prev.items, ...data.items];
          return {
            ...data,
            items: mergedItems,
            offset: prev.offset,
          };
        });
      } catch (err: any) {
        setError(err?.message || "Could not load candidate communications.");
      } finally {
        setLoading(false);
      }
    },
    [actionType, basePath, emailType, query]
  );

  useEffect(() => {
    void loadFeed(0, false);
  }, [loadFeed]);

  const communicationRows = useMemo(() => feed?.items || [], [feed]);
  const displayedRows = useMemo(() => aggregateCandidateRows(communicationRows), [communicationRows]);
  const loadedCount = communicationRows.length;
  const loadedCandidates = displayedRows.length;
  const total = feed?.total || 0;
  const canLoadMore = loadedCount < total;

  const emailTypeOptions = useMemo(() => {
    const dynamic = new Set<string>();
    for (const row of communicationRows) {
      const value = (row.email_type || "").trim();
      if (value) dynamic.add(value);
    }
    for (const known of KNOWN_EMAIL_TYPES) dynamic.add(known);
    return Array.from(dynamic).sort((a, b) => a.localeCompare(b));
  }, [communicationRows]);

  function applyFilters() {
    setQuery(queryInput.trim());
  }

  function clearFilters() {
    setQueryInput("");
    setQuery("");
    setActionType("");
    setEmailType("");
  }

  async function loadMore() {
    if (!feed) return;
    await loadFeed(loadedCount, true);
  }

  return (
    <section className="space-y-3.5">
      <section className="rounded-3xl border border-slate-200/80 bg-white/85 p-4 shadow-[0_18px_32px_-30px_rgba(15,23,42,0.6)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Superadmin communications portal</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Candidate Mail & Link Access</h2>
            <p className="mt-1 text-xs text-slate-600">
              Single feed for all candidates. Every shared mail/link event is searchable with direct access links.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadFeed(0, false)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mt-3 grid gap-2.5 md:grid-cols-4">
          <label className="space-y-1 text-xs text-slate-600 md:col-span-2">
            Search candidate/event
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pl-9 text-sm text-slate-800"
                placeholder="Candidate name, code, email, event type"
              />
            </div>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            Action
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            >
              {ACTION_OPTIONS.map((item) => (
                <option key={item.value || "all"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            Email type
            <select
              value={emailType}
              onChange={(e) => setEmailType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            >
              <option value="">All email types</option>
              {emailTypeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
          <span className="ml-auto text-xs text-slate-500">
            Showing {loadedCandidates} candidates ({loadedCount} of {total} communication records)
          </span>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="space-y-3">
        {displayedRows.length === 0 && !loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-6 text-sm text-slate-600">
            No communication records found for the current filters.
          </div>
        ) : null}

        {displayedRows.map((item) => (
          <CommunicationCard key={item.candidate_id} item={item} />
        ))}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-600">Loading...</div>
        ) : null}

        {canLoadMore ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              className="rounded-full border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              disabled={loading}
            >
              Load more
            </button>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function CommunicationCard({ item }: { item: CandidateCommunicationCandidateRow }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {item.candidate_name} <span className="text-slate-500">({item.candidate_code})</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {item.candidate_email || "-"}{item.opening_title ? ` • ${item.opening_title}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.latest_action_type ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              {item.latest_action_type}
            </span>
          ) : null}
          {item.latest_status ? (
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.latest_status)}`}>
              {item.latest_status}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Latest email type:</span> {item.latest_email_type || "-"}
        </p>
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Latest timestamp:</span> {formatDateTime(item.latest_created_at)}
        </p>
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Matched events:</span> {item.event_count}
        </p>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Candidate links</p>
        {item.links.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {item.links.map((link) => (
              <a
                key={`${item.candidate_id}:${link.label}:${link.url}`}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {link.label}
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500">No candidate-facing link recorded for this event.</p>
        )}
      </div>
    </article>
  );
}
