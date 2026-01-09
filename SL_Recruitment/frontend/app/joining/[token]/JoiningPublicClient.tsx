"use client";

import { useEffect, useMemo, useState } from "react";
import type { JoiningDocsPublicContext } from "@/lib/types";

type Props = {
  token: string;
};

const DOC_TYPES = [
  { value: "pan", label: "PAN card" },
  { value: "aadhaar", label: "Aadhaar card" },
  { value: "marksheets", label: "Marksheets" },
  { value: "experience_letters", label: "Experience letters" },
  { value: "salary_slips", label: "Salary slips" },
  { value: "other", label: "Other documents" },
];

function docTypeLabel(value: string) {
  return DOC_TYPES.find((doc) => doc.value === value)?.label || value.replace(/_/g, " ");
}

export function JoiningPublicClient({ token }: Props) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [context, setContext] = useState<JoiningDocsPublicContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState(DOC_TYPES[0].value);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const requiredSet = useMemo(() => new Set(context?.required_doc_types || []), [context?.required_doc_types]);
  const uploadedTypes = useMemo(() => new Set((context?.docs || []).map((doc) => doc.doc_type)), [context?.docs]);

  const loadContext = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/joining/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as JoiningDocsPublicContext;
      setContext(data);
    } catch (err: any) {
      setError(err?.message || "Joining documents could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const submitUpload = async () => {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("doc_type", selectedType);
      form.append("file", selectedFile);
      const res = await fetch(`${basePath}/api/joining/${encodeURIComponent(token)}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      setSelectedFile(null);
      await loadContext();
    } catch (err: any) {
      setError(err?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    void loadContext();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-10">
      <div className="section-card space-y-2">
        <p className="text-xs uppercase tracking-tight text-slate-600">Joining documents</p>
        <h1 className="text-3xl font-semibold">
          {context?.candidate_name ? `Welcome, ${context.candidate_name}` : "Welcome"}
        </h1>
        <p className="text-sm text-slate-600">
          {context?.opening_title ? `Role: ${context.opening_title}` : "Please upload your joining documents."}
        </p>
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {loading ? (
        <div className="section-card text-sm text-slate-600">Loading documents...</div>
      ) : context ? (
        <>
          <div className="section-card space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                Status: {context.joining_docs_status}
              </span>
              <span className="text-xs text-slate-500">Stored securely in Studio Lotus Drive (internal access only).</span>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">Required documents</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {Array.from(requiredSet).map((doc) => {
                  const complete = uploadedTypes.has(doc);
                  return (
                    <span
                      key={doc}
                      className={complete ? "rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-800 ring-1 ring-emerald-500/20" : "rounded-full bg-amber-500/15 px-3 py-1 text-amber-800 ring-1 ring-amber-500/20"}
                    >
                      {docTypeLabel(doc)} {complete ? "uploaded" : "pending"}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="section-card space-y-3">
            <p className="text-sm font-semibold text-slate-800">Upload a document</p>
            <div className="grid gap-3 md:grid-cols-[1.2fr_1.8fr_auto]">
              <select
                className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-800"
                value={selectedType}
                onChange={(event) => setSelectedType(event.target.value)}
              >
                {DOC_TYPES.map((doc) => (
                  <option key={doc.value} value={doc.value}>{doc.label}</option>
                ))}
              </select>
              <input
                className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-700"
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
              <button
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => void submitUpload()}
                disabled={!selectedFile || uploading}
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
            <p className="text-xs text-slate-500">Accepted file size: up to 10MB per document.</p>
          </div>

          <div className="section-card space-y-3">
            <p className="text-sm font-semibold text-slate-800">Uploaded documents</p>
            {context.docs.length ? (
              <ul className="space-y-2 text-sm text-slate-700">
                {context.docs.map((doc) => (
                  <li key={doc.joining_doc_id} className="flex items-center justify-between rounded-xl border border-white/70 bg-white/60 px-3 py-2">
                    <span>{docTypeLabel(doc.doc_type)} · {doc.file_name}</span>
                    <span className="text-xs text-slate-500">{doc.uploaded_by === "candidate" ? "You" : "HR"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No documents uploaded yet.</p>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}
