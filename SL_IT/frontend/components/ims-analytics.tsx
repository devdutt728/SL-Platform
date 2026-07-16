"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useState } from "react";
import {
  AlertTriangle, BarChart3, Boxes, CircleDollarSign, Download, FileBarChart,
  PackageCheck, RefreshCcw, ShieldAlert, TrendingUp, UserRoundCheck, Wallet, Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import {
  Banner, Column, DataTable, EmptyState, KpiTile, MiniBar, money, formatDate,
  PageHeader, Panel, StatusBadge,
} from "@/components/ims-kit";
import type { Alert, Asset, CostEvent, DashboardSummary, FinanceSummary } from "@/lib/types";

type Mode = "dashboard" | "finance" | "reports" | "alerts" | "my-assets";

const copy: Record<Mode, { title: string; subtitle: string; icon: any }> = {
  dashboard: { title: "Dashboard", subtitle: "Live estate health, asset mix, spend, and what needs attention.", icon: BarChart3 },
  finance: { title: "Finance", subtitle: "This year's spend, budget vs actual, and the 5-year projection.", icon: Wallet },
  reports: { title: "Reports", subtitle: "Deeper cuts by status, category, warranty, allotment, and stock.", icon: FileBarChart },
  alerts: { title: "Alerts", subtitle: "Warranty, renewals, low stock, and overdue repairs — before they bite.", icon: ShieldAlert },
  "my-assets": { title: "My Assets", subtitle: "Everything currently issued to you.", icon: UserRoundCheck },
};

export function ImsAnalytics({ mode }: { mode: Mode }) {
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [events, setEvents] = useState<CostEvent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true); setError("");
    try {
      if (mode === "dashboard" || mode === "reports") setDashboard(await apiFetch<DashboardSummary>("/ims/dashboard/summary"));
      if (mode === "finance" || mode === "reports") {
        const s = await apiFetch<FinanceSummary>("/ims/finance/summary");
        setFinance(s);
        setEvents(await apiFetch<CostEvent[]>(`/ims/finance/cost-events?fy=${s.fy}`));
      }
      if (mode === "alerts") setAlerts(await apiFetch<Alert[]>("/ims/alerts"));
      if (mode === "my-assets") setAssets(await apiFetch<Asset[]>("/ims/my/assets"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load analytics.");
    } finally { setLoading(false); }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [mode]);

  return (
    <div className="space-y-5">
      <section className="section-card">
        <PageHeader
          icon={copy[mode].icon} title={copy[mode].title} subtitle={copy[mode].subtitle}
          actions={
            <>
              {mode === "finance" ? (
                <Button asChild variant="outline" size="sm"><a href="/it/api/ims/finance/export.csv"><Download className="mr-2 h-4 w-4" />Export CSV</a></Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={refresh}><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button>
            </>
          }
        />
        {error ? <div className="mt-3"><Banner tone="error">{error}</Banner></div> : null}
      </section>

      {loading ? <div className="section-card text-sm text-steel">Loading…</div> : (
        <>
          {mode === "dashboard" && dashboard && <DashboardView data={dashboard} />}
          {mode === "finance" && finance && <FinanceView data={finance} events={events} />}
          {mode === "reports" && dashboard && finance && <ReportsView dashboard={dashboard} finance={finance} />}
          {mode === "alerts" && <AlertsView alerts={alerts} />}
          {mode === "my-assets" && <MyAssetsView assets={assets} />}
        </>
      )}
    </div>
  );
}

function n(v: Record<string, number>, k: string) { return v?.[k] ?? 0; }

function DashboardView({ data }: { data: DashboardSummary }) {
  const k = data.kpis;
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Total assets" value={n(k, "total_assets")} icon={Boxes} tone="blue" />
        <KpiTile label="Current book value" value={money(n(k, "current_value"))} icon={CircleDollarSign} tone="emerald" />
        <KpiTile label="Assigned" value={n(k, "assigned_assets")} icon={UserRoundCheck} tone="blue" sub={`${n(k, "available_assets")} available`} />
        <KpiTile label="Open repairs" value={n(k, "open_repairs")} icon={Wrench} tone="orange" />
        <KpiTile label="FY spend" value={money(n(k, "fy_spend"))} icon={Wallet} tone="amber" />
        <KpiTile label="Available" value={n(k, "available_assets")} icon={PackageCheck} tone="emerald" />
        <KpiTile label="Open alerts" value={n(k, "open_alerts")} icon={ShieldAlert} tone={n(k, "open_alerts") ? "red" : "emerald"} />
        <KpiTile label="License seats" value={`${n(data.license, "assigned_seats")}/${n(data.license, "total_seats")}`} icon={TrendingUp} tone="slate" />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel title="By status">
          {data.status_counts.length ? data.status_counts.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-3 text-sm">
              <StatusBadge value={r.name} />
              <span className="tabular-nums font-semibold text-ink">{r.count}</span>
            </div>
          )) : <p className="text-sm text-steel">No assets yet.</p>}
        </Panel>
        <Panel title="Category mix">
          {data.category_mix.length ? data.category_mix.slice(0, 8).map((r) => <MiniBar key={r.name} label={r.name} value={r.count} max={n(k, "total_assets") || 1} />) : <p className="text-sm text-steel">—</p>}
        </Panel>
        <Panel title="Needs attention">
          {data.alerts.length ? data.alerts.slice(0, 6).map((a) => <AlertRow key={`${a.alert_type}-${a.entity_id}`} alert={a} />) : <EmptyState icon={ShieldAlert} title="All clear" hint="No open alerts." />}
        </Panel>
      </section>
    </>
  );
}

function FinanceView({ data, events }: { data: FinanceSummary; events: CostEvent[] }) {
  const variancePositive = data.variance >= 0;
  const eventCols: Column<CostEvent>[] = [
    { key: "cost_type", header: "Type", render: (e) => <StatusBadge value={e.cost_type} tone="slate" /> },
    { key: "source", header: "Source" },
    { key: "category_name", header: "Category", render: (e) => e.category_name || "—" },
    { key: "event_date", header: "Date", render: (e) => formatDate(e.event_date) },
    { key: "amount", header: "Amount", align: "right", render: (e) => money(e.amount, e.currency) },
    { key: "description", header: "Detail", render: (e) => <span className="text-steel">{e.description || "—"}</span> },
  ];
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={`FY ${data.fy} spend`} value={money(data.actual_total)} icon={Wallet} tone="amber" />
        <KpiTile label="Budget" value={money(data.budget_total)} icon={CircleDollarSign} tone="blue" />
        <KpiTile label="Variance" value={money(Math.abs(data.variance))} icon={TrendingUp} tone={variancePositive ? "emerald" : "red"} sub={variancePositive ? "under budget" : "over budget"} />
        <KpiTile label="Forecast (next FY)" value={money(data.forecast_total)} icon={TrendingUp} tone="slate" />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Spend by type">
          {data.by_cost_type.length ? data.by_cost_type.map((r) => <MiniBar key={r.name} label={r.name} value={r.amount} max={Math.max(data.actual_total, 1)} isMoney />) : <p className="text-sm text-steel">No spend recorded yet.</p>}
        </Panel>
        <Panel title="5-year projection · hardware vs software">
          <ProjectionChart rows={data.five_year_projection} />
        </Panel>
      </section>
      <section className="section-card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-steel">Cost ledger</h2>
        <DataTable columns={eventCols} rows={events} keyField={(_, ) => Math.random()} minWidth={760} empty={<span className="text-steel">No cost events this year.</span>} />
      </section>
    </>
  );
}

function ProjectionChart({ rows }: { rows: Array<{ fy: number; hardware: number; software: number; total: number }> }) {
  if (!rows.length) return <p className="text-sm text-steel">Not enough data to project yet.</p>;
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.fy}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-ink">FY {r.fy}</span>
            <span className="tabular-nums text-steel">{money(r.total)}</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-brand" style={{ width: `${(r.hardware / max) * 100}%` }} title={`Hardware ${money(r.hardware)}`} />
            <div className="h-full bg-blue-400" style={{ width: `${(r.software / max) * 100}%` }} title={`Software ${money(r.software)}`} />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-4 pt-1 text-xs text-steel">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> Hardware</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Software</span>
      </div>
    </div>
  );
}

function ReportsView({ dashboard, finance }: { dashboard: DashboardSummary; finance: FinanceSummary }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <Panel title="Warranty health">
        {dashboard.warranty_breakdown.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-3 text-sm">
            <StatusBadge value={r.name} /><span className="tabular-nums font-semibold text-ink">{r.count}</span>
          </div>
        ))}
      </Panel>
      <Panel title="Spend by category">
        {finance.by_category.length ? finance.by_category.map((r) => <MiniBar key={r.name} label={r.name} value={r.amount} max={Math.max(finance.actual_total, 1)} isMoney />) : <p className="text-sm text-steel">—</p>}
      </Panel>
      <Panel title="Allotment">
        <div className="grid grid-cols-2 gap-3">
          <KpiTile label="Issued (30d)" value={n(dashboard.allotment, "recent_30d")} />
          <KpiTile label="Currently held" value={n(dashboard.allotment, "assigned_assets")} />
        </div>
      </Panel>
      <Panel title="Licenses & stock">
        <div className="grid grid-cols-2 gap-3">
          <KpiTile label="Seats used" value={`${n(dashboard.license, "assigned_seats")}/${n(dashboard.license, "total_seats")}`} />
          <KpiTile label="Low-stock items" value={n(dashboard.consumables, "low_stock")} tone={n(dashboard.consumables, "low_stock") ? "red" : "emerald"} />
        </div>
      </Panel>
    </section>
  );
}

function AlertsView({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return <section className="section-card"><EmptyState icon={ShieldAlert} title="All clear" hint="No warranty, renewal, stock, or repair alerts right now." /></section>;
  const high = alerts.filter((a) => a.severity === "HIGH");
  const rest = alerts.filter((a) => a.severity !== "HIGH");
  return (
    <div className="space-y-4">
      {high.length ? <section className="section-card"><h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-600">High priority · {high.length}</h2><div className="space-y-2">{high.map((a) => <AlertRow key={`${a.alert_type}-${a.entity_id}`} alert={a} />)}</div></section> : null}
      {rest.length ? <section className="section-card"><h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-steel">Everything else · {rest.length}</h2><div className="space-y-2">{rest.map((a) => <AlertRow key={`${a.alert_type}-${a.entity_id}`} alert={a} />)}</div></section> : null}
    </div>
  );
}

function MyAssetsView({ assets }: { assets: Asset[] }) {
  const cols: Column<Asset>[] = [
    { key: "asset_tag", header: "Tag", render: (a) => <Link href={`/assets/${a.asset_id}`} className="font-mono font-semibold text-brand hover:underline">{a.asset_tag}</Link> },
    { key: "model", header: "Model", render: (a) => `${a.manufacturer_name || ""} ${a.model_name || ""}`.trim() || "—" },
    { key: "category_name", header: "Category" },
    { key: "condition_rating", header: "Condition", render: (a) => <StatusBadge value={a.condition_rating} /> },
    { key: "location_name", header: "Location", render: (a) => a.location_name || "—" },
  ];
  return (
    <section className="section-card">
      <DataTable columns={cols} rows={assets} keyField={(a) => a.asset_id} onRowClick={(a) => { window.location.href = `/it/assets/${a.asset_id}`; }}
        empty={<EmptyState icon={Boxes} title="Nothing assigned to you" hint="Assets your IT team issues to you will appear here." />} />
    </section>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const high = alert.severity === "HIGH";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <AlertTriangle className={high ? "mt-0.5 h-4 w-4 shrink-0 text-red-600" : "mt-0.5 h-4 w-4 shrink-0 text-amber-500"} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{alert.title}</p>
        <p className="text-xs text-steel">{alert.alert_type.replace(/_/g, " ")}{alert.due_date ? ` · due ${formatDate(alert.due_date)}` : ""}</p>
      </div>
      <StatusBadge value={alert.severity} tone={high ? "red" : "amber"} />
    </div>
  );
}
