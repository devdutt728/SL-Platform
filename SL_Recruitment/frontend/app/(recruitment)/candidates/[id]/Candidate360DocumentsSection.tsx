"use client";

import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { CandidateFull, JoiningDoc } from "@/lib/types";
import { Chip } from "./Candidate360Primitives";

type Props = {
  sectionRef: React.RefObject<HTMLDivElement>;
  collapsed: boolean;
  onToggle: () => void;
  candidateId: string;
  candidate: CandidateFull["candidate"];
  canOpenDriveFolder: boolean;
  canUploadJoiningDocs: boolean;
  joiningDocsNotice: string | null;
  joiningDocsError: string | null;
  joiningDocsBusy: boolean;
  joiningDocs: JoiningDoc[] | null;
  joiningDocType: string;
  joiningDocFile: File | null;
  joiningDocOptions: Array<{ value: string; label: string }>;
  setJoiningDocType: (value: string) => void;
  setJoiningDocFile: (file: File | null) => void;
  handleUploadJoiningDoc: () => Promise<void>;
  docTone: (status?: string | null) => string;
  documentPreviewPath: (candidateId: string, kind: "cv" | "resume" | "portfolio") => string;
  joiningDocLabel: (value: string) => string;
  formatDateTime: (raw?: string | null) => string;
};

export function Candidate360DocumentsSection({
  sectionRef,
  collapsed,
  onToggle,
  candidateId,
  candidate,
  canOpenDriveFolder,
  canUploadJoiningDocs,
  joiningDocsNotice,
  joiningDocsError,
  joiningDocsBusy,
  joiningDocs,
  joiningDocType,
  joiningDocFile,
  joiningDocOptions,
  setJoiningDocType,
  setJoiningDocFile,
  handleUploadJoiningDoc,
  docTone,
  documentPreviewPath,
  joiningDocLabel,
  formatDateTime,
}: Props) {
  return (
    <div ref={sectionRef} className="section-card">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-tight text-slate-500">Documents</p>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white"
          onClick={onToggle}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>
      {collapsed ? null : (
        <div className="mt-3 rounded-2xl border border-white/60 bg-white/30 p-4">
          <p className="text-sm font-semibold">Document status</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip className={docTone(candidate.application_docs_status)}>
              <FileText className="h-3.5 w-3.5" /> Application: {candidate.application_docs_status}
            </Chip>
            <Chip className={docTone(candidate.joining_docs_status)}>
              <FileText className="h-3.5 w-3.5" /> Joining: {candidate.joining_docs_status}
            </Chip>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {candidate.cv_url ? (
              <Link
                href={documentPreviewPath(candidateId, "cv")}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-xl bg-white/70 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
              >
                <ExternalLink className="h-4 w-4" />
                Preview CV
              </Link>
            ) : null}
            {candidate.resume_url ? (
              <Link
                href={documentPreviewPath(candidateId, "resume")}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-xl bg-white/70 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
              >
                <ExternalLink className="h-4 w-4" />
                Preview Resume
              </Link>
            ) : null}
            {candidate.portfolio_url ? (
              <Link
                href={documentPreviewPath(candidateId, "portfolio")}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-xl bg-white/70 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
              >
                <ExternalLink className="h-4 w-4" />
                Preview Portfolio
              </Link>
            ) : candidate.portfolio_not_uploaded_reason ? (
              <span className="inline-flex items-center rounded-xl border border-white/60 bg-white/30 px-4 py-2 text-sm text-slate-700">
                Portfolio not uploaded: {candidate.portfolio_not_uploaded_reason}
              </span>
            ) : null}
            {canOpenDriveFolder && candidate.drive_folder_url ? (
              <Link
                href={candidate.drive_folder_url}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <ExternalLink className="h-4 w-4" />
                Open folder in Drive
              </Link>
            ) : canOpenDriveFolder ? (
              <span className="text-sm text-slate-600">No Drive folder linked yet.</span>
            ) : null}
          </div>

          <div className="mt-4 border-t border-white/60 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Joining documents</p>
              {joiningDocsNotice ? (
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-500/20">
                  {joiningDocsNotice}
                </span>
              ) : null}
            </div>
            {joiningDocsError ? (
              <div className="mt-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-700">
                {joiningDocsError}
              </div>
            ) : null}
            {joiningDocsBusy && !joiningDocs ? (
              <div className="mt-3 text-sm text-slate-600">Loading joining documents...</div>
            ) : null}
            {joiningDocs && joiningDocs.length ? (
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {joiningDocs.map((doc) => (
                  <li key={doc.joining_doc_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/70 bg-white/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{joiningDocLabel(doc.doc_type)}</p>
                      <p className="truncate text-xs text-slate-500">{doc.file_name}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">{formatDateTime(doc.created_at)}</span>
                      <span className="rounded-full bg-white/80 px-2 py-1 text-xs text-slate-600">
                        {doc.uploaded_by === "candidate" ? "Candidate" : "HR"}
                      </span>
                      <Link
                        href={doc.file_url}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : joiningDocs && !joiningDocs.length ? (
              <p className="mt-3 text-sm text-slate-600">No joining documents uploaded yet.</p>
            ) : null}

            {canUploadJoiningDocs ? (
              <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_1.7fr_auto]">
                <select
                  className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-800"
                  value={joiningDocType}
                  onChange={(event) => setJoiningDocType(event.target.value)}
                >
                  {joiningDocOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input
                  className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-700"
                  type="file"
                  onChange={(event) => setJoiningDocFile(event.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() => void handleUploadJoiningDoc()}
                  disabled={!joiningDocFile || joiningDocsBusy}
                >
                  {joiningDocsBusy ? "Uploading..." : "Upload"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
