"use client";

import type React from "react";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { API_BASE, apiFetch } from "@/lib/api";
import { Banner, Column, DataTable, Modal, StatusBadge } from "@/components/ims-kit";
import type { AssetImportResult, AssetImportRow } from "@/lib/types";

async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error((await res.text()) || "Download failed.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ACTION_TONE: Record<string, "blue" | "amber" | "slate" | "red"> = {
  CREATE: "blue",
  UPDATE: "amber",
  UNCHANGED: "slate",
  ERROR: "red",
};

function DiffCell({ row }: { row: AssetImportRow }) {
  if (row.action === "ERROR") return <span className="text-red-600">{row.error}</span>;
  const entries = Object.entries(row.changes);
  if (entries.length === 0) return <span className="text-steel">No changes</span>;
  return (
    <ul className="space-y-0.5 text-xs">
      {entries.map(([field, [oldV, newV]]) => (
        <li key={field}>
          <span className="font-semibold text-ink">{field.replace(/_/g, " ")}: </span>
          <span className="text-steel">{oldV ?? "—"}</span>
          {" → "}
          <span className="text-ink">{newV ?? "—"}</span>
        </li>
      ))}
    </ul>
  );
}

export function AssetImportModal({
  open, onClose, onImported,
}: { open: boolean; onClose: () => void; onImported: () => Promise<void> | void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AssetImportResult | null>(null);
  const [committed, setCommitted] = useState<AssetImportResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setCommitted(null);
    setError(null);
  }
  function close() {
    reset();
    onClose();
  }

  async function runPreview() {
    if (!file) { setError("Choose a CSV file first."); return; }
    setPreviewing(true); setError(null); setCommitted(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      setPreview(await apiFetch<AssetImportResult>("/ims/assets/import/preview", { method: "POST", body: fd }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewing(false);
    }
  }

  async function runCommit() {
    if (!file) return;
    setCommitting(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await apiFetch<AssetImportResult>("/ims/assets/import/commit", { method: "POST", body: fd });
      setCommitted(result);
      setPreview(null);
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  }

  const columns: Column<AssetImportRow>[] = [
    { key: "row", header: "Row", render: (r) => <span className="tabular-nums text-steel">{r.row_number}</span> },
    { key: "tag", header: "Asset tag", render: (r) => <span className="font-mono text-xs">{r.asset_tag || "—"}</span> },
    { key: "action", header: "Action", render: (r) => <StatusBadge value={r.action} tone={ACTION_TONE[r.action]} /> },
    { key: "diff", header: "Changes", render: (r) => <DiffCell row={r} /> },
  ];

  const activeResult = committed || preview;
  const canCommit = !!preview && !committing && (preview.created > 0 || preview.updated > 0);

  return (
    <Modal open={open} onClose={close} title="Bulk import assets" width="max-w-3xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Button type="button" variant="outline" size="sm" onClick={() => downloadFile("/ims/assets/import/template.csv", "ims-asset-template.csv").catch((e) => setError(String(e?.message || e)))}>
            <Download className="mr-2 h-4 w-4" />Template
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => downloadFile("/ims/assets/export.csv", "ims-assets-export.csv").catch((e) => setError(String(e?.message || e)))}>
            <Download className="mr-2 h-4 w-4" />Current data
          </Button>
          <p className="text-xs text-steel">
            Fill in the template (or edit the export) and upload it below. A blank cell always means “leave as is” — it never clears an existing value.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setCommitted(null); setError(null); }}
            className="block flex-1 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
          <Button type="button" size="sm" onClick={runPreview} disabled={!file || previewing || committing}>
            <FileUp className="mr-2 h-4 w-4" />{previewing ? "Checking…" : "Preview"}
          </Button>
        </div>

        {error ? <Banner tone="error" onClose={() => setError(null)}>{error}</Banner> : null}

        {committed ? (
          <Banner tone="success">
            Import complete — {committed.created} created, {committed.updated} updated, {committed.unchanged} unchanged, {committed.errors} errors.
          </Banner>
        ) : null}

        {activeResult ? (
          <>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 text-blue-700"><CheckCircle2 className="h-4 w-4" />{activeResult.created} new</span>
              <span className="inline-flex items-center gap-1.5 text-amber-700"><CheckCircle2 className="h-4 w-4" />{activeResult.updated} updated</span>
              <span className="inline-flex items-center gap-1.5 text-steel"><CheckCircle2 className="h-4 w-4" />{activeResult.unchanged} unchanged</span>
              {activeResult.errors > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-red-700"><AlertTriangle className="h-4 w-4" />{activeResult.errors} errors</span>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
              <DataTable columns={columns} rows={activeResult.rows} keyField={(r) => r.row_number} minWidth={640} />
            </div>
          </>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={close}>Close</Button>
          {!committed ? (
            <Button type="button" size="sm" onClick={runCommit} disabled={!canCommit}>
              {committing ? "Importing…" : "Confirm import"}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
