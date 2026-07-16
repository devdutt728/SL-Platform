"use client";

import type React from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Barcode, Boxes, CheckCircle2, ClipboardList, Download, KeyRound, Package,
  Plus, RefreshCcw, Upload, Wrench, ArrowLeftRight, LogIn,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import {
  Banner, Column, DataTable, EmptyState, Field, Modal, money, formatDate,
  PageHeader, PersonPicker, SelectInput, StatusBadge, TextArea, TextInput,
} from "@/components/ims-kit";
import { AssetImportModal } from "@/components/ims-asset-import-modal";
import type {
  Asset, AssetListResponse, Assignment, Category, Consumable, License, LicenseSeat,
  Location, PersonRef, Purchase, Repair, Vendor,
} from "@/lib/types";

type Mode = "assets" | "allotments" | "repairs" | "purchases" | "licenses" | "consumables";

const modeCopy: Record<Mode, { title: string; subtitle: string; icon: any }> = {
  assets: { title: "Assets", subtitle: "The live register — scan, search, and open any item.", icon: Boxes },
  allotments: { title: "Allotments", subtitle: "Hand assets to people, take them back, and keep a full trail.", icon: CheckCircle2 },
  repairs: { title: "Repairs", subtitle: "Send items out, track them, and bring them back.", icon: Wrench },
  purchases: { title: "Purchases", subtitle: "Record bills and file invoices straight to Drive.", icon: ClipboardList },
  licenses: { title: "Licenses", subtitle: "Subscriptions, renewals, and who holds each seat.", icon: KeyRound },
  consumables: { title: "Consumables", subtitle: "Bulk stock with receive, issue, and low-stock alerts.", icon: Package },
};

export function ImsWorkspace({ mode }: { mode: Mode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [banner, setBanner] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const copy = modeCopy[mode];

  const loadLookups = async () => {
    const [c, v, l, a] = await Promise.all([
      apiFetch<Category[]>("/ims/categories"),
      apiFetch<Vendor[]>("/ims/vendors"),
      apiFetch<Location[]>("/ims/locations"),
      apiFetch<AssetListResponse>("/ims/assets?limit=500"),
    ]);
    setCategories(c); setVendors(v); setLocations(l); setAssets(a.items);
  };

  useEffect(() => {
    setLoading(true);
    loadLookups().catch((e) => setBanner({ tone: "error", text: String(e?.message || e) })).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ok = (text: string) => setBanner({ tone: "success", text });
  const fail = (e: unknown) => setBanner({ tone: "error", text: e instanceof Error ? e.message : String(e) });

  return (
    <div className="space-y-5">
      <section className="section-card">
        <PageHeader
          icon={copy.icon}
          title={copy.title}
          subtitle={copy.subtitle}
          actions={
            <>
              <ScanBar assets={assets} onResult={(t) => setBanner(t)} />
              {mode === "assets" ? (
                <Button asChild size="sm"><Link href="/assets/new"><Plus className="mr-2 h-4 w-4" />Add asset</Link></Button>
              ) : null}
            </>
          }
        />
        {banner ? <div className="mt-3"><Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner></div> : null}
      </section>

      {loading ? (
        <div className="section-card text-sm text-steel">Loading…</div>
      ) : (
        <>
          {mode === "assets" && <AssetsMode assets={assets} categories={categories} reload={loadLookups} />}
          {mode === "allotments" && <AllotmentsMode assets={assets} locations={locations} onOk={ok} onErr={fail} reload={loadLookups} />}
          {mode === "repairs" && <RepairsMode assets={assets} vendors={vendors} onOk={ok} onErr={fail} reload={loadLookups} />}
          {mode === "purchases" && <PurchasesMode assets={assets} vendors={vendors} onOk={ok} onErr={fail} />}
          {mode === "licenses" && <LicensesMode vendors={vendors} onOk={ok} onErr={fail} />}
          {mode === "consumables" && <ConsumablesMode categories={categories} locations={locations} onOk={ok} onErr={fail} />}
        </>
      )}
    </div>
  );
}

// ── scan bar (USB wedge / typed) ──────────────────────────────────────────────
function ScanBar({ assets, onResult }: { assets: Asset[]; onResult: (t: { tone: "success" | "error" | "info"; text: string }) => void }) {
  const [scan, setScan] = useState("");
  async function onScan(e: FormEvent) {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    // instant local match first (works offline for tags in view)
    const local = assets.find((a) => a.asset_tag.toLowerCase() === code.toLowerCase() || (a.serial_number || "").toLowerCase() === code.toLowerCase());
    if (local) { window.location.href = `/it/assets/${local.asset_id}`; return; }
    try {
      const r = await apiFetch<{ found: boolean; asset?: Asset }>(`/ims/scan/${encodeURIComponent(code)}`);
      if (r.found && r.asset) window.location.href = `/it/assets/${r.asset.asset_id}`;
      else onResult({ tone: "error", text: `No asset matched “${code}”.` });
    } catch (err) { onResult({ tone: "error", text: err instanceof Error ? err.message : "Scan failed." }); }
    setScan("");
  }
  return (
    <form onSubmit={onScan} className="flex items-center gap-2">
      <div className="relative">
        <Barcode className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={scan} onChange={(e) => setScan(e.target.value)} autoFocus
          placeholder="Scan tag or serial…"
          className="w-48 rounded-full border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 sm:w-60"
        />
      </div>
      <Button type="submit" variant="outline" size="sm">Go</Button>
    </form>
  );
}

// ── ASSETS ────────────────────────────────────────────────────────────────────
function useIsImsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/it";
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${basePath}/api/auth/me`, { cache: "no-store" });
        if (!res.ok) return;
        const me = (await res.json()) as { roles?: string[]; platform_role_codes?: string[] | null; platform_role_code?: string | null };
        if (cancelled) return;
        const roles = new Set<string>();
        (me.roles || []).forEach((r) => roles.add(String(r).toLowerCase()));
        (me.platform_role_codes || []).forEach((r) => roles.add(String(r).toLowerCase()));
        if (me.platform_role_code) roles.add(String(me.platform_role_code).toLowerCase());
        setIsAdmin(["superadmin", "s_admin", "admin", "ims_admin"].some((r) => roles.has(r)));
      } catch {
        // ignore — button just stays hidden
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return isAdmin;
}

function AssetsMode({ assets, categories, reload }: { assets: Asset[]; categories: Category[]; reload: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const isAdmin = useIsImsAdmin();

  const filtered = useMemo(() => assets.filter((a) => {
    if (cat && String(a.category_id) !== cat) return false;
    if (status && a.status !== status) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      return [a.asset_tag, a.model_name, a.serial_number, a.assigned_name].some((v) => (v || "").toLowerCase().includes(s));
    }
    return true;
  }), [assets, q, cat, status]);

  function exportCsv() {
    const head = ["Tag", "Category", "Model", "Serial", "Status", "Assigned", "Warranty end", "Book value"];
    const rows = filtered.map((a) => [a.asset_tag, a.category_name, `${a.manufacturer_name || ""} ${a.model_name || ""}`.trim(), a.serial_number, a.status, a.assigned_name, a.warranty_end, a.current_book_value]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `ims-assets-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const columns: Column<Asset>[] = [
    { key: "asset_tag", header: "Tag", render: (a) => (
      <Link href={`/assets/${a.asset_id}`} className="font-mono font-semibold text-brand hover:underline" onClick={(e) => e.stopPropagation()}>{a.asset_tag}</Link>
    ) },
    { key: "model", header: "Model", render: (a) => <span>{a.manufacturer_name ? `${a.manufacturer_name} ` : ""}{a.model_name || "—"}<span className="block text-xs text-steel">{a.serial_number || "no serial"}</span></span> },
    { key: "category_name", header: "Category" },
    { key: "status", header: "Status", render: (a) => <StatusBadge value={a.status} /> },
    { key: "assigned", header: "Assigned to", render: (a) => a.assigned_name || a.assigned_email || "—" },
    { key: "warranty", header: "Warranty", render: (a) => a.warranty_end
      ? <StatusBadge value={a.warranty_status || ""} /> : "—" },
    { key: "value", header: "Book value", align: "right", render: (a) => money(a.current_book_value, a.currency) },
  ];

  return (
    <section className="section-card">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tag, serial, model, person…"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
        </div>
        <SelectInput value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
        </SelectInput>
        <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
          <option value="">All statuses</option>
          {["IN_STOCK", "RESERVED", "ASSIGNED", "IN_REPAIR", "RETIRED", "LOST"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </SelectInput>
        <Button variant="outline" size="sm" onClick={exportCsv} title="Quick export of the rows currently on screen (view-only, not for re-uploading)">
          <Download className="mr-2 h-4 w-4" />Export view
        </Button>
        {isAdmin ? (
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} title="Download the import template, or upload a filled sheet to add/update assets in bulk">
            <Upload className="mr-2 h-4 w-4" />Bulk import / template
          </Button>
        ) : null}
      </div>
      <DataTable
        columns={columns} rows={filtered} keyField={(a) => a.asset_id}
        onRowClick={(a) => { window.location.href = `/it/assets/${a.asset_id}`; }}
        empty={<EmptyState icon={Boxes} title="No assets match" hint="Adjust filters, or add your first asset." action={<Button asChild size="sm"><Link href="/assets/new"><Plus className="mr-2 h-4 w-4" />Add asset</Link></Button>} />}
      />
      {isAdmin ? (
        <AssetImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={reload} />
      ) : null}
    </section>
  );
}

// ── shared two-pane layout ────────────────────────────────────────────────────
function TwoPane({ form, table }: { form: React.ReactNode; table: React.ReactNode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
      <section className="section-card h-fit">{form}</section>
      <section className="section-card">{table}</section>
    </div>
  );
}

function FormTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-steel">{children}</h2>;
}

// ── ALLOTMENTS ────────────────────────────────────────────────────────────────
function AllotmentsMode({ assets, locations, onOk, onErr, reload }: {
  assets: Asset[]; locations: Location[]; onOk: (t: string) => void; onErr: (e: unknown) => void; reload: () => Promise<void>;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assetId, setAssetId] = useState("");
  const [person, setPerson] = useState<PersonRef | null>(null);
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => apiFetch<Assignment[]>("/ims/assignments").then(setAssignments).catch(onErr);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const available = assets.filter((a) => a.status === "IN_STOCK" || a.status === "RESERVED");
  const assigned = assets.filter((a) => a.status === "ASSIGNED");

  async function checkout(e: FormEvent) {
    e.preventDefault();
    if (!assetId || !person) { onErr("Pick an asset and an employee."); return; }
    setBusy(true);
    try {
      await apiFetch("/ims/assignments/checkout", { method: "POST", body: JSON.stringify({
        asset_id: Number(assetId), person_id: person.person_id, person_email: person.email, person_name: person.full_name,
        location_id: locationId ? Number(locationId) : undefined, notes: notes || undefined,
      }) });
      onOk(`Checked out to ${person.full_name || person.email}.`);
      setAssetId(""); setPerson(null); setLocationId(""); setNotes("");
      await Promise.all([load(), reload()]);
    } catch (err) { onErr(err); } finally { setBusy(false); }
  }

  async function checkin(asset: Asset) {
    if (!confirm(`Check in ${asset.asset_tag} from ${asset.assigned_name || "current holder"}?`)) return;
    try { await apiFetch(`/ims/assets/${asset.asset_id}/checkin`, { method: "POST", body: JSON.stringify({}) }); onOk(`${asset.asset_tag} returned to stock.`); await Promise.all([load(), reload()]); }
    catch (err) { onErr(err); }
  }

  const historyCols: Column<Assignment>[] = [
    { key: "asset_tag", header: "Asset", render: (a) => <span className="font-mono font-semibold text-ink">{a.asset_tag || `#${a.asset_id}`}</span> },
    { key: "action", header: "Action", render: (a) => <StatusBadge value={a.action} tone={a.action === "CHECKIN" ? "emerald" : a.action === "TRANSFER" ? "amber" : "blue"} /> },
    { key: "person", header: "Person", render: (a) => a.person_name || a.person_email || "—" },
    { key: "assigned_at", header: "When", render: (a) => formatDate(a.assigned_at) },
    { key: "ack", header: "Ack", align: "center", render: (a) => a.acknowledged_at ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" /> : <span className="text-steel">—</span> },
  ];

  return (
    <div className="space-y-4">
      <TwoPane
        form={
          <form onSubmit={checkout} className="space-y-4">
            <FormTitle>Check out an asset</FormTitle>
            <Field label="Asset" required hint={`${available.length} available`}>
              <SelectInput value={assetId} onChange={(e) => setAssetId(e.target.value)} required>
                <option value="">Choose an available asset…</option>
                {available.map((a) => <option key={a.asset_id} value={a.asset_id}>{a.asset_tag} — {a.model_name || a.category_name}</option>)}
              </SelectInput>
            </Field>
            <Field label="Employee" required hint="Type to search the staff directory">
              <PersonPicker value={person} onChange={setPerson} />
            </Field>
            <Field label="Location">
              <SelectInput value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">—</option>
                {locations.map((l) => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
              </SelectInput>
            </Field>
            <Field label="Notes"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional handover note" /></Field>
            <Button disabled={busy}><LogIn className="mr-2 h-4 w-4" />{busy ? "Checking out…" : "Check out"}</Button>
          </form>
        }
        table={
          <>
            <FormTitle>Currently held ({assigned.length})</FormTitle>
            <DataTable
              minWidth={520}
              columns={[
                { key: "asset_tag", header: "Asset", render: (a: Asset) => <Link href={`/assets/${a.asset_id}`} className="font-mono font-semibold text-brand hover:underline">{a.asset_tag}</Link> },
                { key: "assigned", header: "Held by", render: (a: Asset) => a.assigned_name || a.assigned_email || "—" },
                { key: "model", header: "Model", render: (a: Asset) => a.model_name || "—" },
                { key: "action", header: "", align: "right", render: (a: Asset) => <Button variant="outline" size="sm" onClick={() => checkin(a)}><ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />Check in</Button> },
              ]}
              rows={assigned} keyField={(a) => a.asset_id}
              empty={<span className="text-steel">Nothing is checked out right now.</span>}
            />
          </>
        }
      />
      <section className="section-card">
        <FormTitle>Handover history</FormTitle>
        <DataTable columns={historyCols} rows={assignments} keyField={(a) => a.assignment_id} empty={<span className="text-steel">No handovers yet.</span>} />
      </section>
    </div>
  );
}

// ── REPAIRS ───────────────────────────────────────────────────────────────────
function RepairsMode({ assets, vendors, onOk, onErr, reload }: {
  assets: Asset[]; vendors: Vendor[]; onOk: (t: string) => void; onErr: (e: unknown) => void; reload: () => Promise<void>;
}) {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [returning, setReturning] = useState<Repair | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => apiFetch<Repair[]>("/ims/repairs").then(setRepairs).catch(onErr);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const assetId = f.get("asset_id");
    const fault = String(f.get("reported_fault") || "").trim();
    if (!assetId || !fault) { onErr("Pick an asset and describe the fault."); return; }
    setBusy(true);
    try {
      await apiFetch("/ims/repairs", { method: "POST", body: JSON.stringify({
        asset_id: Number(assetId), reported_fault: fault,
        vendor_id: f.get("vendor_id") ? Number(f.get("vendor_id")) : undefined,
        expected_return_at: f.get("expected_return_at") || undefined,
        warranty_covered: f.get("warranty_covered") === "on",
        estimated_cost: f.get("estimated_cost") ? Number(f.get("estimated_cost")) : undefined,
        notes: f.get("notes") || undefined,
      }) });
      (e.target as HTMLFormElement).reset();
      onOk("Repair opened — asset marked In Repair.");
      await Promise.all([load(), reload()]);
    } catch (err) { onErr(err); } finally { setBusy(false); }
  }

  const open = repairs.filter((r) => r.status !== "RETURNED" && r.status !== "CANCELLED");
  const overdue = (r: Repair) => r.expected_return_at && new Date(r.expected_return_at) < new Date() && r.status !== "RETURNED";

  const cols: Column<Repair>[] = [
    { key: "asset_tag", header: "Asset", render: (r) => <span className="font-mono font-semibold text-ink">{r.asset_tag || `#${r.asset_id}`}</span> },
    { key: "fault", header: "Fault", render: (r) => <span className="line-clamp-1">{r.reported_fault}</span> },
    { key: "vendor", header: "Vendor", render: (r) => r.vendor_name || "—" },
    { key: "status", header: "Status", render: (r) => <span className="flex items-center gap-1.5"><StatusBadge value={r.status} />{overdue(r) ? <StatusBadge value="OVERDUE" tone="red" /> : null}</span> },
    { key: "warranty", header: "Cover", render: (r) => r.warranty_covered ? <StatusBadge value="WARRANTY" tone="emerald" /> : <StatusBadge value="PAID" tone="amber" /> },
    { key: "cost", header: "Cost", align: "right", render: (r) => money(r.final_cost ?? r.estimated_cost) },
    { key: "action", header: "", align: "right", render: (r) => (r.status !== "RETURNED" && r.status !== "CANCELLED")
      ? <Button variant="outline" size="sm" onClick={() => setReturning(r)}>Mark returned</Button> : <span className="text-steel">done</span> },
  ];

  async function submitReturn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!returning) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await apiFetch(`/ims/repairs/${returning.repair_id}/return`, { method: "POST", body: JSON.stringify({
        outcome: f.get("outcome") || "REPAIRED",
        final_cost: f.get("final_cost") ? Number(f.get("final_cost")) : undefined,
        parts_replaced: f.get("parts_replaced") || undefined,
        condition_rating: f.get("condition_rating") || undefined,
        return_to_owner: f.get("return_to_owner") === "on",
        notes: f.get("notes") || undefined,
      }) });
      setReturning(null);
      onOk("Repair closed and asset returned.");
      await Promise.all([load(), reload()]);
    } catch (err) { onErr(err); } finally { setBusy(false); }
  }

  return (
    <>
      <TwoPane
        form={
          <form onSubmit={send} className="space-y-4">
            <FormTitle>Send for repair</FormTitle>
            <Field label="Asset" required>
              <SelectInput name="asset_id" required>
                <option value="">Choose asset…</option>
                {assets.filter((a) => a.status !== "RETIRED").map((a) => <option key={a.asset_id} value={a.asset_id}>{a.asset_tag} — {a.model_name || a.category_name}</option>)}
              </SelectInput>
            </Field>
            <Field label="Reported fault" required><TextInput name="reported_fault" placeholder="e.g. Screen flickering" /></Field>
            <Field label="Service vendor">
              <SelectInput name="vendor_id"><option value="">—</option>{vendors.map((v) => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}</SelectInput>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expected return"><TextInput name="expected_return_at" type="date" /></Field>
              <Field label="Est. cost (₹)"><TextInput name="estimated_cost" type="number" placeholder="0" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input name="warranty_covered" type="checkbox" className="h-4 w-4 rounded border-slate-300" /> Covered under warranty</label>
            <Field label="Notes"><TextInput name="notes" placeholder="Optional" /></Field>
            <Button disabled={busy}><Wrench className="mr-2 h-4 w-4" />{busy ? "Saving…" : "Open repair"}</Button>
          </form>
        }
        table={
          <>
            <FormTitle>Repair queue · {open.length} open</FormTitle>
            <DataTable columns={cols} rows={repairs} keyField={(r) => r.repair_id} minWidth={760}
              empty={<span className="text-steel">No repairs logged.</span>} />
          </>
        }
      />

      <Modal open={!!returning} onClose={() => setReturning(null)} title={`Return ${returning?.asset_tag || "asset"} from repair`}>
        <form onSubmit={submitReturn} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Outcome" required>
              <SelectInput name="outcome" defaultValue="REPAIRED">
                {["REPAIRED", "REPLACED", "BER", "NO_FAULT", "CANCELLED"].map((o) => <option key={o} value={o}>{o}</option>)}
              </SelectInput>
            </Field>
            <Field label="Condition now">
              <SelectInput name="condition_rating" defaultValue="GOOD">
                {["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"].map((c) => <option key={c} value={c}>{c}</option>)}
              </SelectInput>
            </Field>
          </div>
          <Field label="Final cost (₹)"><TextInput name="final_cost" type="number" placeholder="0" /></Field>
          <Field label="Parts replaced"><TextInput name="parts_replaced" placeholder="Optional" /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input name="return_to_owner" type="checkbox" className="h-4 w-4 rounded border-slate-300" /> Return straight to previous holder</label>
          <Field label="Notes"><TextArea name="notes" rows={2} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setReturning(null)}>Cancel</Button>
            <Button size="sm" disabled={busy}>{busy ? "Saving…" : "Confirm return"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── PURCHASES ─────────────────────────────────────────────────────────────────
function PurchasesMode({ assets, vendors, onOk, onErr }: {
  assets: Asset[]; vendors: Vendor[]; onOk: (t: string) => void; onErr: (e: unknown) => void;
}) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [busy, setBusy] = useState(false);
  const [invoiceFor, setInvoiceFor] = useState<Purchase | null>(null);

  const load = () => apiFetch<Purchase[]>("/ims/purchases").then(setPurchases).catch(onErr);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const linkAsset = f.get("asset_id");
      await apiFetch("/ims/purchases", { method: "POST", body: JSON.stringify({
        vendor_id: f.get("vendor_id") ? Number(f.get("vendor_id")) : undefined,
        invoice_number: f.get("invoice_number") || undefined,
        invoice_date: f.get("invoice_date") || undefined,
        total: f.get("total") ? Number(f.get("total")) : undefined,
        lines: linkAsset ? [{ asset_id: Number(linkAsset), quantity: 1, unit_cost: f.get("total") ? Number(f.get("total")) : undefined }] : [],
      }) });
      (e.target as HTMLFormElement).reset();
      onOk("Purchase recorded.");
      await load();
    } catch (err) { onErr(err); } finally { setBusy(false); }
  }

  async function uploadInvoice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!invoiceFor) return;
    const file = (new FormData(e.currentTarget).get("file")) as File;
    if (!file || !file.size) { onErr("Choose a file."); return; }
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      await apiFetch(`/ims/attachments?entity_type=purchase&entity_id=${invoiceFor.purchase_id}&kind=INVOICE`, { method: "POST", body: fd });
      setInvoiceFor(null);
      onOk("Invoice filed to Google Drive.");
      await load();
    } catch (err) { onErr(err); } finally { setBusy(false); }
  }

  const cols: Column<Purchase>[] = [
    { key: "invoice", header: "Invoice", render: (p) => <span className="font-semibold text-ink">{p.invoice_number || `#${p.purchase_id}`}</span> },
    { key: "vendor", header: "Vendor", render: (p) => p.vendor_name || "—" },
    { key: "date", header: "Date", render: (p) => formatDate(p.invoice_date) },
    { key: "total", header: "Total", align: "right", render: (p) => money(p.total, p.currency) },
    { key: "doc", header: "Invoice file", render: (p) => p.invoice_file_url
      ? <a href={p.invoice_file_url} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">View on Drive ↗</a>
      : <Button variant="outline" size="sm" onClick={() => setInvoiceFor(p)}><Upload className="mr-1.5 h-3.5 w-3.5" />Attach</Button> },
  ];

  return (
    <>
      <TwoPane
        form={
          <form onSubmit={save} className="space-y-4">
            <FormTitle>Record a bill</FormTitle>
            <Field label="Vendor"><SelectInput name="vendor_id"><option value="">—</option>{vendors.map((v) => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}</SelectInput></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice no."><TextInput name="invoice_number" placeholder="INV-…" /></Field>
              <Field label="Invoice date"><TextInput name="invoice_date" type="date" /></Field>
            </div>
            <Field label="Total (₹)"><TextInput name="total" type="number" placeholder="0" /></Field>
            <Field label="Link to asset" hint="Optional — attach this bill to an asset">
              <SelectInput name="asset_id"><option value="">—</option>{assets.map((a) => <option key={a.asset_id} value={a.asset_id}>{a.asset_tag} — {a.model_name || a.category_name}</option>)}</SelectInput>
            </Field>
            <Button disabled={busy}><Plus className="mr-2 h-4 w-4" />{busy ? "Saving…" : "Save purchase"}</Button>
          </form>
        }
        table={
          <>
            <FormTitle>Purchase history</FormTitle>
            <DataTable columns={cols} rows={purchases} keyField={(p) => p.purchase_id} minWidth={680}
              empty={<span className="text-steel">No purchases recorded yet.</span>} />
          </>
        }
      />
      <Modal open={!!invoiceFor} onClose={() => setInvoiceFor(null)} title={`Attach invoice — ${invoiceFor?.invoice_number || `#${invoiceFor?.purchase_id}`}`}>
        <form onSubmit={uploadInvoice} className="space-y-4">
          <p className="text-sm text-steel">The file is uploaded to the shared Google Drive and linked here automatically.</p>
          <input name="file" type="file" accept="application/pdf,image/*" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setInvoiceFor(null)}>Cancel</Button>
            <Button size="sm" disabled={busy}>{busy ? "Uploading…" : "Upload to Drive"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── LICENSES ──────────────────────────────────────────────────────────────────
function LicensesMode({ vendors, onOk, onErr }: { vendors: Vendor[]; onOk: (t: string) => void; onErr: (e: unknown) => void }) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [busy, setBusy] = useState(false);
  const [seatsFor, setSeatsFor] = useState<License | null>(null);
  const [seats, setSeats] = useState<LicenseSeat[]>([]);
  const [newSeat, setNewSeat] = useState<PersonRef | null>(null);

  const load = () => apiFetch<License[]>("/ims/licenses").then(setLicenses).catch(onErr);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!String(f.get("name") || "").trim()) { onErr("Name the license."); return; }
    setBusy(true);
    try {
      await apiFetch("/ims/licenses", { method: "POST", body: JSON.stringify({
        name: f.get("name"), vendor_id: f.get("vendor_id") ? Number(f.get("vendor_id")) : undefined,
        billing_cycle: f.get("billing_cycle") || "ANNUAL", total_seats: Number(f.get("total_seats") || 1),
        cost: f.get("cost") ? Number(f.get("cost")) : undefined, renewal_date: f.get("renewal_date") || undefined,
        registered_email: f.get("registered_email") || undefined,
      }) });
      (e.target as HTMLFormElement).reset();
      onOk("License added.");
      await load();
    } catch (err) { onErr(err); } finally { setBusy(false); }
  }

  async function openSeats(l: License) {
    setSeatsFor(l); setSeats([]); setNewSeat(null);
    try { setSeats(await apiFetch<LicenseSeat[]>(`/ims/licenses/${l.license_id}/seats`)); } catch (err) { onErr(err); }
  }
  async function assignSeat() {
    if (!seatsFor || !newSeat) return;
    try {
      await apiFetch(`/ims/licenses/${seatsFor.license_id}/seats`, { method: "POST", body: JSON.stringify({ person_id: newSeat.person_id, person_email: newSeat.email, person_name: newSeat.full_name }) });
      setNewSeat(null);
      setSeats(await apiFetch<LicenseSeat[]>(`/ims/licenses/${seatsFor.license_id}/seats`));
      await load();
    } catch (err) { onErr(err); }
  }
  async function releaseSeat(seatId: number) {
    try { await apiFetch(`/ims/license-seats/${seatId}/release`, { method: "POST", body: JSON.stringify({}) }); if (seatsFor) setSeats(await apiFetch<LicenseSeat[]>(`/ims/licenses/${seatsFor.license_id}/seats`)); await load(); }
    catch (err) { onErr(err); }
  }

  const renewSoon = (d?: string | null) => d && (new Date(d).getTime() - Date.now()) / 864e5 < 45;

  const cols: Column<License>[] = [
    { key: "name", header: "License", render: (l) => <span className="font-semibold text-ink">{l.name}<span className="block text-xs text-steel">{l.vendor_name || ""}</span></span> },
    { key: "seats", header: "Seats", render: (l) => (
      <span className="inline-flex items-center gap-2">
        <span className="tabular-nums">{l.assigned_seats}/{l.total_seats}</span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-brand" style={{ width: `${Math.min(100, (l.assigned_seats / (l.total_seats || 1)) * 100)}%` }} /></span>
      </span>
    ) },
    { key: "cycle", header: "Billing", render: (l) => <StatusBadge value={l.billing_cycle} tone="slate" /> },
    { key: "renewal", header: "Renews", render: (l) => l.renewal_date ? <span className={renewSoon(l.renewal_date) ? "font-semibold text-amber-600" : ""}>{formatDate(l.renewal_date)}</span> : "—" },
    { key: "cost", header: "Cost", align: "right", render: (l) => money(l.cost, l.currency) },
    { key: "action", header: "", align: "right", render: (l) => <Button variant="outline" size="sm" onClick={() => openSeats(l)}>Seats</Button> },
  ];

  return (
    <>
      <TwoPane
        form={
          <form onSubmit={add} className="space-y-4">
            <FormTitle>Add a license</FormTitle>
            <Field label="Name" required><TextInput name="name" placeholder="e.g. Adobe Creative Cloud" /></Field>
            <Field label="Vendor"><SelectInput name="vendor_id"><option value="">—</option>{vendors.map((v) => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}</SelectInput></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Billing"><SelectInput name="billing_cycle" defaultValue="ANNUAL">{["ANNUAL", "MONTHLY", "QUARTERLY", "ONE_TIME"].map((b) => <option key={b}>{b}</option>)}</SelectInput></Field>
              <Field label="Seats"><TextInput name="total_seats" type="number" defaultValue={1} min={1} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cost (₹)"><TextInput name="cost" type="number" placeholder="0" /></Field>
              <Field label="Renews on"><TextInput name="renewal_date" type="date" /></Field>
            </div>
            <Field label="Registered email"><TextInput name="registered_email" placeholder="account@studiolotus.in" /></Field>
            <Button disabled={busy}><Plus className="mr-2 h-4 w-4" />{busy ? "Saving…" : "Add license"}</Button>
          </form>
        }
        table={
          <>
            <FormTitle>License register</FormTitle>
            <DataTable columns={cols} rows={licenses} keyField={(l) => l.license_id} minWidth={720}
              empty={<span className="text-steel">No licenses tracked yet.</span>} />
          </>
        }
      />
      <Modal open={!!seatsFor} onClose={() => setSeatsFor(null)} title={`Seats — ${seatsFor?.name || ""}`}>
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1"><Field label="Assign to"><PersonPicker value={newSeat} onChange={setNewSeat} /></Field></div>
            <Button size="sm" onClick={assignSeat} disabled={!newSeat}>Assign</Button>
          </div>
          <DataTable
            minWidth={360}
            columns={[
              { key: "person", header: "Holder", render: (s: LicenseSeat) => s.person_name || s.person_email || "—" },
              { key: "since", header: "Since", render: (s: LicenseSeat) => formatDate(s.assigned_at) },
              { key: "action", header: "", align: "right", render: (s: LicenseSeat) => s.released_at ? <StatusBadge value="RELEASED" tone="slate" /> : <Button variant="outline" size="sm" onClick={() => releaseSeat(s.seat_id)}>Release</Button> },
            ]}
            rows={seats.filter((s) => !s.released_at)} keyField={(s) => s.seat_id}
            empty={<span className="text-steel">No active seats.</span>}
          />
        </div>
      </Modal>
    </>
  );
}

// ── CONSUMABLES ───────────────────────────────────────────────────────────────
function ConsumablesMode({ categories, locations, onOk, onErr }: {
  categories: Category[]; locations: Location[]; onOk: (t: string) => void; onErr: (e: unknown) => void;
}) {
  const [items, setItems] = useState<Consumable[]>([]);
  const [busy, setBusy] = useState(false);
  const [txnFor, setTxnFor] = useState<Consumable | null>(null);

  const load = () => apiFetch<Consumable[]>("/ims/consumables").then(setItems).catch(onErr);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!String(f.get("name") || "").trim()) { onErr("Name the item."); return; }
    setBusy(true);
    try {
      await apiFetch("/ims/consumables", { method: "POST", body: JSON.stringify({
        name: f.get("name"), category_id: f.get("category_id") ? Number(f.get("category_id")) : undefined,
        unit: f.get("unit") || "pcs", current_qty: Number(f.get("current_qty") || 0), min_qty: Number(f.get("min_qty") || 0),
        location_id: f.get("location_id") ? Number(f.get("location_id")) : undefined,
      }) });
      (e.target as HTMLFormElement).reset();
      onOk("Stock item added.");
      await load();
    } catch (err) { onErr(err); } finally { setBusy(false); }
  }

  async function txn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!txnFor) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await apiFetch(`/ims/consumables/${txnFor.consumable_id}/transactions`, { method: "POST", body: JSON.stringify({
        direction: f.get("direction"), qty: Number(f.get("qty") || 0), reference: f.get("reference") || undefined, notes: f.get("notes") || undefined,
      }) });
      setTxnFor(null);
      onOk("Stock updated.");
      await load();
    } catch (err) { onErr(err); } finally { setBusy(false); }
  }

  const cols: Column<Consumable>[] = [
    { key: "name", header: "Item", render: (c) => <span className="font-semibold text-ink">{c.name}<span className="block text-xs text-steel">{c.category_name || ""}</span></span> },
    { key: "qty", header: "On hand", align: "right", render: (c) => <span className="tabular-nums">{c.current_qty} {c.unit}</span> },
    { key: "min", header: "Min", align: "right", render: (c) => <span className="tabular-nums text-steel">{c.min_qty}</span> },
    { key: "loc", header: "Location", render: (c) => c.location_name || "—" },
    { key: "stock", header: "Stock", render: (c) => <StatusBadge value={c.low_stock ? "LOW" : "OK"} /> },
    { key: "action", header: "", align: "right", render: (c) => (
      <div className="flex justify-end gap-1.5">
        <Button variant="outline" size="sm" onClick={() => setTxnFor(c)}>Receive / issue</Button>
      </div>
    ) },
  ];

  return (
    <>
      <TwoPane
        form={
          <form onSubmit={add} className="space-y-4">
            <FormTitle>Add a stock item</FormTitle>
            <Field label="Item name" required><TextInput name="name" placeholder="e.g. HDMI cable" /></Field>
            <Field label="Category"><SelectInput name="category_id"><option value="">—</option>{categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</SelectInput></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Unit"><TextInput name="unit" placeholder="pcs" defaultValue="pcs" /></Field>
              <Field label="On hand"><TextInput name="current_qty" type="number" defaultValue={0} /></Field>
              <Field label="Min level"><TextInput name="min_qty" type="number" defaultValue={0} /></Field>
            </div>
            <Field label="Location"><SelectInput name="location_id"><option value="">—</option>{locations.map((l) => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}</SelectInput></Field>
            <Button disabled={busy}><Plus className="mr-2 h-4 w-4" />{busy ? "Saving…" : "Add item"}</Button>
          </form>
        }
        table={
          <>
            <FormTitle>Stock levels</FormTitle>
            <DataTable columns={cols} rows={items} keyField={(c) => c.consumable_id} minWidth={720}
              empty={<span className="text-steel">No stock items yet.</span>} />
          </>
        }
      />
      <Modal open={!!txnFor} onClose={() => setTxnFor(null)} title={`Update stock — ${txnFor?.name || ""}`}>
        <form onSubmit={txn} className="space-y-4">
          <p className="text-sm text-steel">On hand now: <span className="font-semibold text-ink">{txnFor?.current_qty} {txnFor?.unit}</span></p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Direction" required><SelectInput name="direction" defaultValue="IN">{["IN", "OUT", "ADJUST"].map((d) => <option key={d} value={d}>{d === "IN" ? "Receive (IN)" : d === "OUT" ? "Issue (OUT)" : "Adjust"}</option>)}</SelectInput></Field>
            <Field label="Quantity" required><TextInput name="qty" type="number" min={1} defaultValue={1} /></Field>
          </div>
          <Field label="Reference"><TextInput name="reference" placeholder="Issued to / PO no." /></Field>
          <Field label="Notes"><TextInput name="notes" /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setTxnFor(null)}>Cancel</Button>
            <Button size="sm" disabled={busy}>{busy ? "Saving…" : "Apply"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
