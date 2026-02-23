"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OpeningDetail, OpeningListItem, PlatformPersonSuggestion } from "@/lib/types";
import { redirectToLogin } from "@/lib/auth-client";
import { fetchDeduped } from "@/lib/fetch-deduped";

type Props = {
  initialOpenings: OpeningListItem[];
  initialMe: {
    roles?: string[] | null;
    platform_role_id?: number | string | null;
    platform_role_ids?: Array<number | string> | null;
    platform_role_name?: string | null;
    platform_role_names?: string[] | null;
    platform_role_code?: string | null;
    platform_role_codes?: string[] | null;
  } | null;
};

function normalizeRoleToken(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isHrRoleToken(value: unknown): boolean {
  const token = normalizeRoleToken(value);
  if (!token) return false;
  const compact = token.replace(/_/g, "");
  if (token === "hr" || token.startsWith("hr_") || token.startsWith("hr")) return true;
  return compact.includes("humanresource");
}

export function OpeningsClient({ initialOpenings, initialMe }: Props) {
  const [openings, setOpenings] = useState<OpeningListItem[]>(initialOpenings);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestedByTooltip, setRequestedByTooltip] = useState<{ opening: OpeningListItem; rect: DOMRect } | null>(null);
  const [requestedByTooltipPos, setRequestedByTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const requestedByTooltipRef = useRef<HTMLDivElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [requestedByQuery, setRequestedByQuery] = useState("");
  const [requestedByLoading, setRequestedByLoading] = useState(false);
  const [requestedByOptions, setRequestedByOptions] = useState<PlatformPersonSuggestion[]>([]);
  const [requestedBySelected, setRequestedBySelected] = useState<PlatformPersonSuggestion | null>(null);
  const [requestedByOpen, setRequestedByOpen] = useState(false);
  const [updatingOpening, setUpdatingOpening] = useState<OpeningDetail | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("Delhi");
  const [country, setCountry] = useState("India");
  const [headcount, setHeadcount] = useState(1);
  const roleIdRaw = initialMe?.platform_role_id ?? null;
  const roleIdNum = typeof roleIdRaw === "number" ? roleIdRaw : Number(roleIdRaw);
  const platformRoleId = Number.isFinite(roleIdNum) ? roleIdNum : null;
  const platformRoleIds = (initialMe?.platform_role_ids || []) as Array<number | string>;
  const platformRoleName = initialMe?.platform_role_name ?? null;
  const platformRoleNames = (initialMe?.platform_role_names || []).map((name) => String(name || ""));
  const platformRoleCode = initialMe?.platform_role_code ?? null;
  const platformRoleCodes = (initialMe?.platform_role_codes || []).map((code) => String(code || ""));
  const roles = (initialMe?.roles || []).map((role) => String(role || ""));

  const activeCount = useMemo(() => openings.filter((o) => o.is_active).length, [openings]);

  const normalizedRoles = useMemo(
    () => (roles || []).map((role) => normalizeRoleToken(role)).filter(Boolean),
    [roles]
  );
  const normalizedRoleCodes = useMemo(
    () => [...platformRoleCodes, platformRoleCode || ""].map((code) => normalizeRoleToken(code)).filter(Boolean),
    [platformRoleCode, platformRoleCodes]
  );
  const normalizedRoleNames = useMemo(
    () => [...platformRoleNames, platformRoleName || ""].map((name) => normalizeRoleToken(name)).filter(Boolean),
    [platformRoleName, platformRoleNames]
  );
  const allRoleIds = useMemo(() => {
    const numeric = [platformRoleId, ...(platformRoleIds || [])]
      .map((id) => (typeof id === "number" ? id : Number(id)))
      .filter((id) => Number.isFinite(id));
    return Array.from(new Set(numeric));
  }, [platformRoleId, platformRoleIds]);

  const isSuperadmin = useMemo(
    () =>
      allRoleIds.includes(2) ||
      normalizedRoleCodes.some((code) => ["2", "superadmin", "s_admin", "super_admin"].includes(code)),
    [allRoleIds, normalizedRoleCodes]
  );
  const isHr = useMemo(
    () =>
      allRoleIds.includes(5) ||
      normalizedRoles.some((token) => isHrRoleToken(token)) ||
      normalizedRoleCodes.some((token) => isHrRoleToken(token)) ||
      normalizedRoleNames.some((token) => isHrRoleToken(token)),
    [allRoleIds, normalizedRoleCodes, normalizedRoleNames, normalizedRoles]
  );
  const canCreateOpenings = useMemo(() => isSuperadmin, [isSuperadmin]);
  const canToggleOpenings = useMemo(() => isSuperadmin || isHr, [isSuperadmin, isHr]);
  const canEditOpenings = useMemo(() => isSuperadmin, [isSuperadmin]);
  const canDeleteOpenings = useMemo(() => isSuperadmin, [isSuperadmin]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const refreshOpenings = async () => {
    try {
      const res = await fetchDeduped("/api/rec/openings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as OpeningListItem[];
      setOpenings(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void refreshOpenings();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let pending = false;
    const source = new EventSource("/api/rec/events/stream");

    async function refresh() {
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      try {
        await refreshOpenings();
      } finally {
        inFlight = false;
        if (pending && !cancelled) {
          pending = false;
          void refresh();
        }
      }
    }

    source.onmessage = () => {
      void refresh();
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = requestedByQuery.trim();
    if (!requestedByOpen) return;

    const handle = window.setTimeout(() => {
      (async () => {
        setRequestedByLoading(true);
        try {
          const res = await fetchDeduped(`/api/platform/people?q=${encodeURIComponent(q)}&limit=10`, { cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as PlatformPersonSuggestion[];
          if (!cancelled) setRequestedByOptions(data);
        } catch {
          // ignore
        } finally {
          if (!cancelled) setRequestedByLoading(false);
        }
      })();
    }, q.length < 2 ? 0 : 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [requestedByQuery, requestedByOpen]);

  useLayoutEffect(() => {
    if (!requestedByTooltip || !requestedByTooltipRef.current) return;
    const padding = 12;
    const rect = requestedByTooltip.rect;
    const tooltipRect = requestedByTooltipRef.current.getBoundingClientRect();

    let viewportLeft = rect.left;
    if (viewportLeft + tooltipRect.width + padding > window.innerWidth) {
      viewportLeft = window.innerWidth - tooltipRect.width - padding;
    }
    if (viewportLeft < padding) viewportLeft = padding;

    let viewportTop = rect.bottom + 8;
    if (viewportTop + tooltipRect.height + padding > window.innerHeight) {
      viewportTop = rect.top - tooltipRect.height - 8;
    }
    if (viewportTop < padding) viewportTop = padding;

    setRequestedByTooltipPos({ left: viewportLeft + window.scrollX, top: viewportTop + window.scrollY });
  }, [requestedByTooltip]);

  async function createOpening(formData: FormData) {
    if (!canCreateOpenings) {
      setError("Action not available.");
      return;
    }
    if (!canEditOpenings && updatingOpening) {
      setError("Action not available.");
      return;
    }
    setCreating(true);
    setError(null);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      location_city: city.trim() || null,
      location_country: country.trim() || null,
      requested_by_person_id_platform: requestedBySelected?.person_id ?? null,
      headcount_required: headcount || 1,
      is_active: true,
    };

    const isUpdate = !!updatingOpening;

    const res = await fetch(isUpdate ? `/api/rec/openings/${updatingOpening?.opening_id}` : "/api/rec/openings", {
      method: isUpdate ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setError(await formatApiError(res));
      setCreating(false);
      return;
    }

    const saved = (await res.json()) as OpeningListItem;
    if (isUpdate) {
      setOpenings((prev) => prev.map((o) => (o.opening_id === saved.opening_id ? { ...o, ...saved } : o)));
    } else {
      setOpenings((prev) => [saved, ...prev]);
    }
    setCreating(false);
    setUpdatingOpening(null);
    setTitle("");
    setDescription("");
    setCity("Delhi");
    setCountry("India");
    setHeadcount(1);
    setRequestedBySelected(null);
    setRequestedByQuery("");
    setRequestedByOptions([]);
  }

  async function setOpeningActive(openingId: number, isActive: boolean) {
    if (!canToggleOpenings) {
      setError("Action not available.");
      return;
    }
    setError(null);
    const res = await fetch(`/api/rec/openings/${openingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: isActive }),
    });
    if (!res.ok) {
      setError(await formatApiError(res));
      return;
    }
    const updated = (await res.json()) as OpeningListItem;
    setOpenings((prev) => prev.map((o) => (o.opening_id === openingId ? { ...o, ...updated } : o)));
  }

  async function deleteOpening(openingId: number) {
    if (!canDeleteOpenings) {
      setError("Action not available.");
      return;
    }
    if (!window.confirm("Delete this opening? This cannot be undone.")) return;
    setError(null);
    const res = await fetch(`/api/rec/openings/${openingId}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await formatApiError(res));
      return;
    }
    setOpenings((prev) => prev.filter((o) => o.opening_id !== openingId));
  }

  async function copyApplyLink(openingCode: string) {
    const url = `${window.location.origin}/apply/${encodeURIComponent(openingCode)}`;
    try {
      await navigator.clipboard.writeText(url);
      setError("Copied apply link.");
      window.setTimeout(() => setError(null), 1200);
    } catch {
      setError(url);
    }
  }

  async function editOpening(openingId: number) {
    if (!canEditOpenings) return;
    setError(null);
    try {
      const res = await fetchDeduped(`/api/rec/openings/${openingId}`, { cache: "no-store" });
      if (!res.ok) {
        setError(await formatApiError(res));
        return;
      }
      const data = (await res.json()) as OpeningDetail;
      setUpdatingOpening(data);
      setTitle(data.title || "");
      setDescription(data.description || "");
      setCity(data.location_city || "Delhi");
      setCountry(data.location_country || "India");
      setHeadcount(data.headcount_required ?? 1);
    } catch {
      setError("Could not load opening for edit.");
    }
  }

  return (
    <main className="content-pad space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-tight text-slate-500">Roles</p>
          <h1 className="text-2xl font-semibold">Roles</h1>
          <p className="text-sm text-slate-500">{activeCount} active</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Live</span>
        </div>
      </div>

      {canCreateOpenings ? (
        <form
          className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void createOpening(new FormData(e.currentTarget));
            e.currentTarget.reset();
            setRequestedByQuery("");
            setRequestedByOptions([]);
            setRequestedBySelected(null);
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-tight text-slate-500">Create opening</p>
              <p className="text-sm text-slate-500">Superadmin only. Opening codes are generated automatically and are immutable.</p>
            </div>
            <button
              className="rounded-full bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-card hover:bg-teal-700 disabled:opacity-60"
              disabled={creating}
              type="submit"
          >
            {creating ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-slate-600">Title</span>
            <input
              name="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
              placeholder="Senior UX Designer"
            />
          </label>
          <label className="space-y-1 md:col-span-4">
            <span className="text-xs text-slate-600">Role description</span>
            <textarea
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-24 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
              placeholder="Write a short role summary, responsibilities, and requirements..."
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">City</span>
            <input
              name="location_city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
              placeholder="Delhi"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Country</span>
            <input
              name="location_country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
              placeholder="India"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Headcount required</span>
            <input
              name="headcount_required"
              type="number"
              value={headcount}
              onChange={(e) => setHeadcount(Number(e.target.value) || 1)}
              className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
              placeholder="1"
            />
          </label>
          <div className="space-y-1 md:col-span-2">
            <span className="text-xs text-slate-600">Requested by</span>
            <div className="relative">
              <input
                value={requestedBySelected ? `${requestedBySelected.full_name} (${requestedBySelected.email})` : requestedByQuery}
                onChange={(e) => {
                  setRequestedBySelected(null);
                  setRequestedByQuery(e.target.value);
                }}
                onFocus={() => setRequestedByOpen(true)}
                onBlur={() => window.setTimeout(() => setRequestedByOpen(false), 150)}
                className="w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2"
                placeholder="Type a name/email or pick from suggestions"
              />
              {requestedByLoading ? (
                <div className="absolute right-3 top-2 text-xs text-slate-500">Searching…</div>
              ) : null}
              {!requestedBySelected && requestedByOpen && requestedByOptions.length > 0 ? (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
                  {requestedByOptions.map((p) => (
                    <button
                      key={p.person_id}
                      type="button"
                      className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => {
                        setRequestedBySelected(p);
                        setRequestedByOptions([]);
                      }}
                    >
                      <span className="truncate">
                        <span className="font-medium">{p.full_name}</span>{" "}
                        <span className="text-slate-500">({p.email})</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">{p.person_id}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {requestedBySelected ? (
              <p className="text-xs text-slate-500">
                Selected: {requestedBySelected.full_name} • {requestedBySelected.role_name || requestedBySelected.role_code || "Person"} •{" "}
                {requestedBySelected.person_id}
              </p>
            ) : null}
          </div>
        </div>
        {updatingOpening ? (
          <p className="mt-2 text-xs text-slate-500">
            Editing: <span className="font-semibold text-slate-700">{updatingOpening.opening_code}</span> — codes are immutable.
          </p>
        ) : null}
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </form>
      ) : null}

      <div className="relative overflow-x-auto overflow-y-visible rounded-2xl border border-slate-200 bg-white/60">
        <table className="min-w-[980px] w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[13%]" />
            <col className="w-[21%]" />
            <col className="w-[12%]" />
            <col className="w-[15%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[21%]" />
          </colgroup>
          <thead className="bg-white/30">
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Code</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Title</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">City</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">Requested by</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left font-semibold">Status</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left font-semibold">Openings</th>
              <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-center font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {openings.map((opening) => (
              <tr key={opening.opening_id} className="text-sm text-slate-800">
                <td className="border-b border-slate-200 px-3 py-2 font-semibold">{opening.opening_code || "-"}</td>
                <td className="border-b border-slate-200 px-3 py-2 truncate">{opening.title || "-"}</td>
                <td className="border-b border-slate-200 px-3 py-2 text-left text-slate-600">{opening.location_city || "-"}</td>
                <td className="border-b border-slate-200 px-3 py-2 text-left text-slate-600">
                  <div className="inline-block">
                    <span
                      className="cursor-default"
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setRequestedByTooltip({ opening, rect });
                        setRequestedByTooltipPos(null);
                      }}
                      onMouseLeave={() => {
                        setRequestedByTooltip(null);
                        setRequestedByTooltipPos(null);
                      }}
                    >
                      {displayRequestedBy(opening)}
                    </span>
                  </div>
                </td>
                <td className="border-b border-slate-200 px-2 py-2 text-left">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      opening.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {opening.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="border-b border-slate-200 px-2 py-2 text-left font-semibold">
                  {opening.headcount_required ?? "-"}
                </td>
                <td className="border-b border-slate-200 px-2 py-1">
                  <div className="flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap">
                    {opening.opening_code ? (
                      <button
                        className="rounded-full border border-slate-200 bg-white/60 px-2 py-0.5 text-[11px] font-semibold leading-5 text-slate-700 hover:bg-white/80"
                        onClick={() => void copyApplyLink(opening.opening_code!)}
                        type="button"
                        title="Copy public apply link"
                      >
                        Copy
                      </button>
                    ) : null}
                    {canEditOpenings ? (
                      <button
                        className="rounded-full border border-slate-200 bg-white/60 px-2 py-0.5 text-[11px] font-semibold leading-5 text-slate-700 hover:bg-white/80"
                        onClick={() => void editOpening(opening.opening_id)}
                        type="button"
                      >
                        Edit
                      </button>
                    ) : null}
                    {canToggleOpenings && !opening.is_active ? (
                      <button
                        className="rounded-full border border-slate-200 bg-white/60 px-2 py-0.5 text-[11px] font-semibold leading-5 text-slate-700 hover:bg-white/80"
                        onClick={() => void setOpeningActive(opening.opening_id, true)}
                        type="button"
                      >
                        Activate
                      </button>
                    ) : null}
                    {canToggleOpenings && opening.is_active ? (
                      <button
                        className="rounded-full border border-slate-200 bg-white/60 px-2 py-0.5 text-[11px] font-semibold leading-5 text-slate-700 hover:bg-white/80"
                        onClick={() => void setOpeningActive(opening.opening_id, false)}
                        type="button"
                      >
                        Deactivate
                      </button>
                    ) : null}
                    {canDeleteOpenings ? (
                      <button
                        className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold leading-5 text-red-700 hover:bg-red-100"
                        onClick={() => void deleteOpening(opening.opening_id)}
                        type="button"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {openings.length === 0 && (
              <tr>
                <td className="px-3 py-10 text-center text-sm text-slate-500" colSpan={7}>
                  No openings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isMounted && requestedByTooltip
        ? createPortal(
            <div
              ref={requestedByTooltipRef}
              className="pointer-events-none absolute z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl"
              style={
                requestedByTooltipPos
                  ? { left: requestedByTooltipPos.left, top: requestedByTooltipPos.top }
                  : { left: -9999, top: -9999 }
              }
            >
              <p className="text-sm font-semibold">{requestedByTooltip.opening.requested_by_name || "Unknown person"}</p>
              <p className="text-xs text-slate-600">
                Role: {requestedByTooltip.opening.requested_by_role_name || requestedByTooltip.opening.requested_by_role_code || "N/A"}
              </p>
              <p className="text-xs text-slate-600">
                Person id: {requestedByTooltip.opening.requested_by_person_id_platform || "N/A"}
              </p>
              <p className="text-xs text-slate-600">Contact: {requestedByTooltip.opening.requested_by_phone || "N/A"}</p>
              <p className="text-xs text-slate-600">Email: {requestedByTooltip.opening.requested_by_email || "N/A"}</p>
            </div>,
            document.body
          )
        : null}
    </main>
  );
}

async function formatApiError(res: Response): Promise<string> {
  const raw = (await res.text()).trim();
  const detail = extractDetail(raw);
  if (res.status === 409) return detail || "Cannot delete opening because it has dependent records.";
  if (res.status === 401) {
    redirectToLogin();
    return detail || "Session expired. Redirecting to login.";
  }
  if (res.status === 403) return detail || "Action not allowed.";
  return detail || raw || `Request failed (${res.status})`;
}

function extractDetail(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "detail" in parsed && typeof (parsed as any).detail === "string") {
      return (parsed as any).detail;
    }
  } catch {
    // ignore
  }
  return null;
}

function firstNameOnly(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  const token = text.split(/\s+/)[0];
  return token || text;
}

function displayRequestedBy(opening: OpeningListItem) {
  const name = (opening.requested_by_name || "").trim();
  if (name) return firstNameOnly(name);
  const email = (opening.requested_by_email || "").trim();
  if (email) return firstNameOnly(email.split("@")[0]);
  const pid = (opening.requested_by_person_id_platform || "").trim();
  return pid || "-";
}
