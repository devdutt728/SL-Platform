"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle2,
  Contact,
  Copy,
  FileStack,
  Home,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { JoiningDocPublic, JoiningDocsPublicContext, JoiningProfilePublic } from "@/lib/types";

type Props = {
  token: string;
};

type DocConfig = {
  value: string;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
  required: boolean;
};

type QueuedUpload = {
  id: string;
  file: File;
};

type UploadProgress = {
  total: number;
  completed: number;
  currentLabel: string;
};

type WorkspaceView = "documents" | "profile";

type FieldProps = {
  label: string;
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "date";
};

type SelectFieldProps = {
  label: string;
  value?: string | null;
  onChange: (value: string) => void;
  options: string[];
};

type ProfileSectionProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
};

const ACCEPTED_FILES = ".csv,.doc,.docx,.jpeg,.jpg,.pdf,.png,.ppt,.pptx,.rtf,.txt,.xls,.xlsx";

const DOC_TYPES: DocConfig[] = [
  {
    value: "pan",
    label: "PAN card",
    shortLabel: "PAN",
    description: "Government ID used for tax verification and payroll onboarding.",
    accent: "from-[#1f4a6a]/14 via-[#1f4a6a]/6 to-white",
    required: true,
  },
  {
    value: "aadhaar",
    label: "Aadhaar card",
    shortLabel: "Aadhaar",
    description: "Identity proof used for background checks and statutory records.",
    accent: "from-[#b45309]/14 via-[#b45309]/6 to-white",
    required: true,
  },
  {
    value: "marksheets",
    label: "Marksheets",
    shortLabel: "Marksheets",
    description: "Academic records from your latest qualifying education.",
    accent: "from-[#0f766e]/14 via-[#0f766e]/6 to-white",
    required: true,
  },
  {
    value: "experience_letters",
    label: "Experience letters",
    shortLabel: "Experience",
    description: "Relieving, service, or experience proof from prior employers.",
    accent: "from-[#7c3aed]/14 via-[#7c3aed]/6 to-white",
    required: true,
  },
  {
    value: "salary_slips",
    label: "Salary slips",
    shortLabel: "Salary",
    description: "Recent salary slips for compensation verification.",
    accent: "from-[#be123c]/14 via-[#be123c]/6 to-white",
    required: true,
  },
  {
    value: "other",
    label: "Other supporting documents",
    shortLabel: "Other",
    description: "Optional files such as certifications or additional supporting proofs.",
    accent: "from-[#475569]/14 via-[#475569]/6 to-white",
    required: false,
  },
];

const EMPTY_PROFILE: JoiningProfilePublic = {
  personal_id: "",
  middle_name: "",
  date_of_birth: "",
  gender: "",
  marital_status: "",
  marriage_date: "",
  blood_group: "",
  physically_handicapped: "",
  nationality: "",
  mobile_number: "",
  personal_email: "",
  current_address_line_1: "",
  current_address_line_2: "",
  current_address_city: "",
  current_address_state: "",
  current_address_zip: "",
  current_address_country: "India",
  permanent_address_line_1: "",
  permanent_address_line_2: "",
  permanent_address_city: "",
  permanent_address_state: "",
  permanent_address_zip: "",
  permanent_address_country: "India",
  father_name: "",
  mother_name: "",
  spouse_name: "",
  children_names: "",
  aadhaar_number: "",
  pf_number: "",
  uan_number: "",
  profile_status: "draft",
  submitted_at: null,
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function docTypeLabel(value: string) {
  return DOC_TYPES.find((doc) => doc.value === value)?.label || value.replace(/_/g, " ");
}

function normalizeProfile(profile?: JoiningProfilePublic | null): JoiningProfilePublic {
  return {
    ...EMPTY_PROFILE,
    ...(profile || {}),
    date_of_birth: profile?.date_of_birth ? profile.date_of_birth.slice(0, 10) : "",
    marriage_date: profile?.marriage_date ? profile.marriage_date.slice(0, 10) : "",
  };
}

function mergeProfileDraft(serverProfile: JoiningProfilePublic, draftProfile: JoiningProfilePublic | null) {
  if (!draftProfile) return serverProfile;
  return {
    ...serverProfile,
    ...draftProfile,
    profile_status: serverProfile.profile_status || draftProfile.profile_status || "draft",
    submitted_at: serverProfile.submitted_at ?? draftProfile.submitted_at ?? null,
  };
}

function deriveDocsStatus(docs: JoiningDocPublic[], requiredDocTypes: string[]) {
  const uploadedSet = new Set(docs.map((doc) => doc.doc_type));
  if (uploadedSet.size === 0) return "none";
  if (requiredDocTypes.every((docType) => uploadedSet.has(docType))) return "complete";
  return "partial";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

async function readErrorResponse(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await res.json()) as { detail?: string };
    return body.detail || "Request failed.";
  }
  const text = await res.text();
  return text || "Request failed.";
}

function readDraftProfile(draftStorageKey: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) return null;
    return normalizeProfile(JSON.parse(raw) as JoiningProfilePublic);
  } catch {
    return null;
  }
}

function hasProfileContent(profile: JoiningProfilePublic) {
  return Object.entries(profile).some(([key, value]) => {
    if (key === "profile_status" || key === "submitted_at") return false;
    return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "Just now";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Just now";
  return DATE_TIME_FORMATTER.format(parsed);
}

function buildQueuedUpload(file: File): QueuedUpload {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file,
  };
}

function Field({ label, value, onChange, placeholder, type = "text" }: FieldProps) {
  return (
    <label className="space-y-2 text-sm text-slate-700">
      <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <input
        type={type}
        className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition focus:border-[#d56a43] focus:ring-4 focus:ring-[#f4d3c7]"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
      <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <textarea
        className="min-h-28 w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition focus:border-[#d56a43] focus:ring-4 focus:ring-[#f4d3c7]"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: SelectFieldProps) {
  return (
    <label className="space-y-2 text-sm text-slate-700">
      <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <select
        className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition focus:border-[#d56a43] focus:ring-4 focus:ring-[#f4d3c7]"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProfileSection({ title, subtitle, icon: Icon, action, children }: ProfileSectionProps) {
  return (
    <section className="section-card space-y-4 border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,247,244,0.94))] p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-slate-900 p-2.5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
            <Icon className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function JoiningPublicClient({ token }: Props) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const searchParams = useSearchParams();
  const [context, setContext] = useState<JoiningDocsPublicContext | null>(null);
  const [profile, setProfile] = useState<JoiningProfilePublic>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queuedUploads, setQueuedUploads] = useState<Record<string, QueuedUpload[]>>({});
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("documents");
  const profileHydratedRef = useRef(false);
  const suppressDraftSyncRef = useRef(false);

  const linkExp = (searchParams.get("exp") || "").trim();
  const linkSig = (searchParams.get("sig") || "").trim();
  const signedQuery =
    linkExp && linkSig ? `?exp=${encodeURIComponent(linkExp)}&sig=${encodeURIComponent(linkSig)}` : "";
  const draftStorageKey = `slr:joining-profile-draft:${token}`;

  const requiredDocTypes = useMemo(() => context?.required_doc_types || [], [context?.required_doc_types]);
  const uploadedTypes = useMemo(() => new Set((context?.docs || []).map((doc) => doc.doc_type)), [context?.docs]);
  const groupedDocs = useMemo(
    () =>
      DOC_TYPES.map((docType) => ({
        ...docType,
        docs: (context?.docs || []).filter((doc) => doc.doc_type === docType.value),
      })).filter((docType) => docType.docs.length > 0),
    [context?.docs],
  );
  const docsCompletedCount = useMemo(
    () => requiredDocTypes.filter((docType) => uploadedTypes.has(docType)).length,
    [requiredDocTypes, uploadedTypes],
  );
  const totalQueuedFiles = useMemo(
    () => Object.values(queuedUploads).reduce((sum, files) => sum + files.length, 0),
    [queuedUploads],
  );
  const totalUploadedFiles = context?.docs.length || 0;

  useEffect(() => {
    profileHydratedRef.current = false;
    setDraftSaved(false);

    async function loadContext() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${basePath}/api/joining/${encodeURIComponent(token)}${signedQuery}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await readErrorResponse(res));
        const data = (await res.json()) as JoiningDocsPublicContext;
        setContext(data);

        const serverProfile = normalizeProfile(data.profile);
        const draftProfile = readDraftProfile(draftStorageKey);
        setProfile(mergeProfileDraft(serverProfile, draftProfile));
        setDraftSaved(Boolean(draftProfile));
        profileHydratedRef.current = true;
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      } finally {
        setLoading(false);
      }
    }

    void loadContext();
  }, [basePath, draftStorageKey, signedQuery, token]);

  useEffect(() => {
    if (!profileHydratedRef.current) return;
    if (suppressDraftSyncRef.current) {
      suppressDraftSyncRef.current = false;
      return;
    }
    if (typeof window === "undefined") return;

    if (!hasProfileContent(profile)) {
      window.localStorage.removeItem(draftStorageKey);
      setDraftSaved(false);
      return;
    }

    window.localStorage.setItem(draftStorageKey, JSON.stringify(profile));
    setDraftSaved(true);
  }, [draftStorageKey, profile]);

  function updateContextDocs(uploadedDocsBatch: JoiningDocPublic[]) {
    setContext((previous) => {
      if (!previous) return previous;
      const mergedDocs = [...uploadedDocsBatch.slice().reverse(), ...previous.docs];
      return {
        ...previous,
        docs: mergedDocs,
        joining_docs_status: deriveDocsStatus(mergedDocs, previous.required_doc_types),
      };
    });
  }

  function appendQueuedFiles(docType: string, fileList: FileList | null) {
    if (!fileList?.length) return;
    setQueuedUploads((previous) => ({
      ...previous,
      [docType]: [...(previous[docType] || []), ...Array.from(fileList).map(buildQueuedUpload)],
    }));
    setNotice(null);
    setError(null);
  }

  function removeQueuedFile(docType: string, uploadId: string) {
    setQueuedUploads((previous) => {
      const nextForType = (previous[docType] || []).filter((entry) => entry.id !== uploadId);
      if (nextForType.length === 0) {
        const rest = { ...previous };
        delete rest[docType];
        return rest;
      }
      return { ...previous, [docType]: nextForType };
    });
  }

  function copyCurrentToPermanentAddress() {
    setProfile((previous) => ({
      ...previous,
      permanent_address_line_1: previous.current_address_line_1,
      permanent_address_line_2: previous.current_address_line_2,
      permanent_address_city: previous.current_address_city,
      permanent_address_state: previous.current_address_state,
      permanent_address_zip: previous.current_address_zip,
      permanent_address_country: previous.current_address_country || "India",
    }));
    setNotice("Permanent address copied from current address.");
  }

  async function uploadAllDocuments() {
    const uploadQueue = Object.entries(queuedUploads).flatMap(([docType, uploads]) =>
      uploads.map((upload) => ({ docType, upload })),
    );
    if (!uploadQueue.length || uploading) return;

    setUploading(true);
    setError(null);
    setNotice(null);

    const uploadedDocsBatch: JoiningDocPublic[] = [];
    const failedUploads: string[] = [];

    try {
      for (let index = 0; index < uploadQueue.length; index += 1) {
        const current = uploadQueue[index];
        setUploadProgress({
          total: uploadQueue.length,
          completed: index,
          currentLabel: `${docTypeLabel(current.docType)} · ${current.upload.file.name}`,
        });

        const form = new FormData();
        form.append("doc_type", current.docType);
        form.append("file", current.upload.file);

        try {
          const res = await fetch(`${basePath}/api/joining/${encodeURIComponent(token)}/upload${signedQuery}`, {
            method: "POST",
            body: form,
          });
          if (!res.ok) throw new Error(await readErrorResponse(res));
          const uploadedDoc = (await res.json()) as JoiningDocPublic;
          uploadedDocsBatch.push(uploadedDoc);
          setQueuedUploads((previous) => {
            const nextForType = (previous[current.docType] || []).filter((entry) => entry.id !== current.upload.id);
            if (nextForType.length === 0) {
              const rest = { ...previous };
              delete rest[current.docType];
              return rest;
            }
            return { ...previous, [current.docType]: nextForType };
          });
        } catch (uploadError) {
          failedUploads.push(`${current.upload.file.name}: ${getErrorMessage(uploadError)}`);
        }
      }

      if (uploadedDocsBatch.length) {
        updateContextDocs(uploadedDocsBatch);
      }

      if (failedUploads.length) {
        setError(`Some files could not be uploaded. ${failedUploads[0]}`);
        if (uploadedDocsBatch.length) {
          setNotice(`${uploadedDocsBatch.length} file(s) uploaded successfully. Remaining files are still queued.`);
        }
      } else if (uploadedDocsBatch.length) {
        setNotice(`${uploadedDocsBatch.length} file(s) uploaded successfully.`);
      }
    } finally {
      setUploadProgress(null);
      setUploading(false);
    }
  }

  async function saveProfile() {
    if (savingProfile) return;
    setSavingProfile(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`${basePath}/api/joining/${encodeURIComponent(token)}/profile${signedQuery}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...profile,
          date_of_birth: profile.date_of_birth || null,
          marriage_date: profile.marriage_date || null,
        }),
      });
      if (!res.ok) throw new Error(await readErrorResponse(res));

      const savedProfile = normalizeProfile((await res.json()) as JoiningProfilePublic);
      suppressDraftSyncRef.current = true;
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      setDraftSaved(false);
      setProfile(savedProfile);
      setContext((previous) => (previous ? { ...previous, profile: savedProfile } : previous));
      setNotice("Profile saved successfully. HR can now review these details without asking you to refill them.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSavingProfile(false);
    }
  }

  const readinessPanel = (
    <aside className="section-card space-y-4 border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(247,245,242,0.95))] p-4 xl:sticky xl:top-4 xl:w-[290px] xl:self-start">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Readiness
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
          <div className="rounded-[1rem] border border-slate-200/80 bg-white p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Required uploaded</p>
            <p className="mt-1.5 text-xl font-semibold text-slate-950">
              {docsCompletedCount}/{requiredDocTypes.length}
            </p>
          </div>
          <div className="rounded-[1rem] border border-slate-200/80 bg-white p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Files stored</p>
            <p className="mt-1.5 text-xl font-semibold text-slate-950">{totalUploadedFiles}</p>
          </div>
          <div className="rounded-[1rem] border border-slate-200/80 bg-white p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Local draft</p>
            <p className="mt-1.5 text-xl font-semibold text-slate-950">{draftSaved ? "On" : "Off"}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Required checklist</h3>
          <span className="text-xs text-slate-500">{context?.joining_docs_status}</span>
        </div>
        <div className="space-y-1.5">
          {requiredDocTypes.map((docType) => {
            const complete = uploadedTypes.has(docType);
            return (
              <div
                key={docType}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                  complete
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <span>{docTypeLabel(docType)}</span>
                <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                  {complete ? "Ready" : "Pending"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Uploaded documents</h3>
        {groupedDocs.length ? (
          <div className="max-h-[24rem] space-y-2 overflow-auto pr-1">
            {groupedDocs.map((group) => (
              <div key={group.value} className="rounded-[1rem] border border-slate-200/80 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">{group.label}</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {group.docs.length}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {group.docs.slice(0, 4).map((doc) => (
                    <div key={doc.joining_doc_id} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="truncate text-sm font-medium text-slate-800">{doc.file_name}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(doc.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[1rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            No documents uploaded yet.
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f6efe9_0%,#f3f1ed_38%,#edeae6_100%)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-8rem] h-[24rem] w-[24rem] rounded-full bg-[#d56a43]/12 blur-3xl" />
        <div className="absolute right-[-4rem] top-24 h-[18rem] w-[18rem] rounded-full bg-[#1f4a6a]/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[18rem] w-[18rem] rounded-full bg-[#0f766e]/8 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1580px] flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6 lg:py-6">
        <section className="section-card relative overflow-hidden border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,244,240,0.96)_58%,rgba(238,241,246,0.95))] px-5 py-5 text-slate-950 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
          <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#d56a43]/10 blur-3xl" />
          <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(360px,0.95fr)]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d6c8c0] bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.28em] text-[#6c4a3b]">
                <Sparkles className="h-3.5 w-3.5" />
                Joining workspace
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight xl:text-3xl">
                  {context?.candidate_name ? `Welcome, ${context.candidate_name}` : "Complete your joining kit"}
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-600">
                  {context?.opening_title
                    ? `Role confirmed: ${context.opening_title}. Upload all joining documents together, keep your profile safe while you work, and submit once with confidence.`
                    : "Upload your joining documents, complete your profile, and hand off a clean, verified packet to HR."}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 xl:max-w-2xl">
                <div className="rounded-2xl border border-slate-200/80 bg-white/88 px-4 py-2.5">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Required docs</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">
                    {docsCompletedCount}/{requiredDocTypes.length}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/88 px-4 py-2.5">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Queued now</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">{totalQueuedFiles}</div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/88 px-4 py-2.5">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Profile draft</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">{draftSaved ? "Protected" : "Live"}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-2 self-start rounded-[1.4rem] border border-slate-200/80 bg-white/86 p-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] xl:grid-cols-1">
              <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <UploadCloud className="mt-0.5 h-4 w-4 text-[#c45f3a]" />
                <div>
                  <p className="font-semibold text-slate-900">1. Add files</p>
                  <p className="text-xs text-slate-600">Queue documents by category, then upload once.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-[#1f4a6a]" />
                <div>
                  <p className="font-semibold text-slate-900">2. No form reset</p>
                  <p className="text-xs text-slate-600">Draft storage keeps typed data intact during uploads.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#0f766e]" />
                <div>
                  <p className="font-semibold text-slate-900">3. Save once</p>
                  <p className="text-xs text-slate-600">HR verifies PAN and Aadhaar after submission.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
            <button
              type="button"
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                workspaceView === "documents"
                  ? "bg-slate-950 text-white shadow-[0_10px_20px_rgba(15,23,42,0.14)]"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              onClick={() => setWorkspaceView("documents")}
            >
              Documents
            </button>
            <button
              type="button"
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                workspaceView === "profile"
                  ? "bg-slate-950 text-white shadow-[0_10px_20px_rgba(15,23,42,0.14)]"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              onClick={() => setWorkspaceView("profile")}
            >
              Profile
            </button>
          </div>
          <p className="text-sm text-slate-500">
            {workspaceView === "documents"
              ? "Finish documents first, then switch to profile when ready."
              : "Complete the profile section-wise and switch back anytime."}
          </p>
        </div>

        {loading ? (
          <div className="section-card text-sm text-slate-600">Loading your joining workspace...</div>
        ) : context ? (
          <>
            <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.72fr)_290px]">
              <div className="section-card self-start space-y-4 border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,246,242,0.94))] p-4">
                {workspaceView === "documents" ? (
                  <>
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_280px] xl:items-start">
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full bg-[#f4ece5] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#7a4a32]">
                          <FileStack className="h-3.5 w-3.5" />
                          Document desk
                        </div>
                        <h2 className="text-xl font-semibold text-slate-950">Upload all joining documents in one pass</h2>
                        <p className="max-w-2xl text-sm leading-6 text-slate-500">
                          Select files under the right category, review the queue, and upload everything together. Accepted formats include PDF, images, Office files, text, and spreadsheets up to 10MB each.
                        </p>
                      </div>

                      <div className="flex flex-col items-stretch gap-2 rounded-[1.2rem] border border-slate-200/80 bg-white/90 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                        <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                          <span>Document status</span>
                          <span>{context.joining_docs_status}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#1f4a6a,#d56a43)] transition-all"
                            style={{
                              width: `${requiredDocTypes.length ? (docsCompletedCount / requiredDocTypes.length) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <button
                          className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-55"
                          onClick={() => void uploadAllDocuments()}
                          disabled={!totalQueuedFiles || uploading}
                        >
                          {uploading
                            ? uploadProgress
                              ? `Uploading ${uploadProgress.completed + 1}/${uploadProgress.total}`
                              : "Uploading..."
                            : totalQueuedFiles
                              ? `Upload all selected files (${totalQueuedFiles})`
                              : "Select files to start"}
                        </button>
                        <p className="text-xs text-slate-500">
                          {uploadProgress
                            ? `Current file: ${uploadProgress.currentLabel}`
                            : "You can keep filling the profile while documents are queued."}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {DOC_TYPES.map((docType) => {
                        const queuedForType = queuedUploads[docType.value] || [];
                        const uploadedCount = context.docs.filter((doc) => doc.doc_type === docType.value).length;
                        const isRequired = requiredDocTypes.includes(docType.value);

                        return (
                          <div
                            key={docType.value}
                            className="grid gap-3 rounded-[1.1rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0.92))] p-3 shadow-[0_8px_18px_rgba(15,23,42,0.05)] lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.82fr)] lg:items-center"
                          >
                            <div className={`rounded-[1rem] bg-gradient-to-br ${docType.accent} p-3`}>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-semibold text-slate-950">{docType.label}</p>
                                    {uploadedCount ? (
                                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                                        Uploaded
                                      </span>
                                    ) : isRequired ? (
                                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                                        Required
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                                        Optional
                                      </span>
                                    )}
                                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                                      Stored {uploadedCount}
                                    </span>
                                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                                      Queued {queuedForType.length}
                                    </span>
                                  </div>
                                  <p className="text-sm leading-6 text-slate-600">{docType.description}</p>
                                </div>
                              </div>

                              <div className="mt-2.5">
                                {queuedForType.length ? (
                                  <div className="flex flex-wrap gap-2">
                                    {queuedForType.map((entry) => (
                                      <div
                                        key={entry.id}
                                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                                      >
                                        <span className="max-w-[12rem] truncate">{entry.file.name}</span>
                                        <button
                                          type="button"
                                          className="font-semibold text-slate-400 transition hover:text-rose-600"
                                          onClick={() => removeQueuedFile(docType.value, entry.id)}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-500">Nothing queued yet for {docType.shortLabel.toLowerCase()}.</p>
                                )}
                              </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-[1fr_auto] lg:grid-cols-1 xl:grid-cols-[1fr_auto] xl:items-center">
                              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/90 px-4 py-3 text-center transition hover:border-[#d56a43] hover:bg-[#fff8f4]">
                                <UploadCloud className="h-4.5 w-4.5 text-[#d56a43]" />
                                <span className="text-sm font-semibold text-slate-900">Add files</span>
                                <input
                                  className="hidden"
                                  type="file"
                                  accept={ACCEPTED_FILES}
                                  multiple
                                  onChange={(event) => {
                                    appendQueuedFiles(docType.value, event.currentTarget.files);
                                    event.currentTarget.value = "";
                                  }}
                                />
                              </label>
                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</p>
                                <p className="mt-1 font-medium text-slate-900">
                                  {uploadedCount
                                    ? `${uploadedCount} file(s) already uploaded`
                                    : isRequired
                                      ? "Required document pending"
                                      : "Optional document"}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_260px] lg:items-start">
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full bg-[#eef2f7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#47627c]">
                          <Contact className="h-3.5 w-3.5" />
                          Joining profile
                        </div>
                        <h2 className="text-xl font-semibold text-slate-950">Profile focus mode</h2>
                        <p className="max-w-3xl text-sm text-slate-500">
                          Complete the form section-wise in a compact layout. Your local draft stays protected while you work, and you can switch back to documents anytime.
                        </p>
                      </div>
                      <div className="flex flex-col items-stretch gap-2 rounded-[1.2rem] border border-slate-200/80 bg-white/90 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                        <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                          <span>Draft safety</span>
                          <span>{draftSaved ? "Saved locally" : "Tracking changes"}</span>
                        </div>
                        <button
                          className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-55"
                          onClick={() => void saveProfile()}
                          disabled={savingProfile}
                        >
                          {savingProfile ? "Saving profile..." : "Save profile"}
                        </button>
                        <p className="text-xs text-slate-500">
                          Complete the sections below, then save once for HR review.
                        </p>
                      </div>
                    </div>

                    <div className="grid items-start gap-4 xl:grid-cols-2">
                      <ProfileSection
                        title="Identity and compliance"
                        subtitle="Core identity information used for joining verification and statutory checks."
                        icon={ShieldCheck}
                      >
                        <Field
                          label="PAN number"
                          value={profile.personal_id}
                          onChange={(value) => setProfile((previous) => ({ ...previous, personal_id: value.toUpperCase() }))}
                          placeholder="ABCDE1234F"
                        />
                        <Field
                          label="Aadhaar number"
                          value={profile.aadhaar_number}
                          onChange={(value) => setProfile((previous) => ({ ...previous, aadhaar_number: value }))}
                          placeholder="12 digit Aadhaar"
                        />
                        <Field
                          label="Middle name"
                          value={profile.middle_name}
                          onChange={(value) => setProfile((previous) => ({ ...previous, middle_name: value }))}
                        />
                        <Field
                          label="Date of birth"
                          type="date"
                          value={profile.date_of_birth}
                          onChange={(value) => setProfile((previous) => ({ ...previous, date_of_birth: value }))}
                        />
                        <SelectField
                          label="Gender"
                          value={profile.gender}
                          onChange={(value) => setProfile((previous) => ({ ...previous, gender: value }))}
                          options={["Male", "Female", "Non-binary", "Prefer not to say"]}
                        />
                        <SelectField
                          label="Marital status"
                          value={profile.marital_status}
                          onChange={(value) => setProfile((previous) => ({ ...previous, marital_status: value }))}
                          options={["Single", "Married", "Divorced", "Widowed"]}
                        />
                        <Field
                          label="Marriage date"
                          type="date"
                          value={profile.marriage_date}
                          onChange={(value) => setProfile((previous) => ({ ...previous, marriage_date: value }))}
                        />
                        <Field
                          label="Blood group"
                          value={profile.blood_group}
                          onChange={(value) => setProfile((previous) => ({ ...previous, blood_group: value }))}
                          placeholder="B+"
                        />
                        <SelectField
                          label="Physically handicapped"
                          value={profile.physically_handicapped}
                          onChange={(value) => setProfile((previous) => ({ ...previous, physically_handicapped: value }))}
                          options={["No", "Yes"]}
                        />
                        <Field
                          label="Nationality"
                          value={profile.nationality}
                          onChange={(value) => setProfile((previous) => ({ ...previous, nationality: value }))}
                          placeholder="Indian"
                        />
                      </ProfileSection>

                      <ProfileSection
                        title="Contact and payroll"
                        subtitle="Personal contact details and statutory identifiers for payroll setup."
                        icon={WalletCards}
                      >
                        <Field
                          label="Personal mobile number"
                          value={profile.mobile_number}
                          onChange={(value) => setProfile((previous) => ({ ...previous, mobile_number: value }))}
                          placeholder="+91..."
                        />
                        <Field
                          label="Personal email"
                          type="email"
                          value={profile.personal_email}
                          onChange={(value) => setProfile((previous) => ({ ...previous, personal_email: value }))}
                          placeholder="name@gmail.com"
                        />
                        <Field
                          label="PF number"
                          value={profile.pf_number}
                          onChange={(value) => setProfile((previous) => ({ ...previous, pf_number: value }))}
                        />
                        <Field
                          label="UAN number"
                          value={profile.uan_number}
                          onChange={(value) => setProfile((previous) => ({ ...previous, uan_number: value }))}
                        />
                      </ProfileSection>

                      <ProfileSection
                        title="Current address"
                        subtitle="Your present residential address used for communication and records."
                        icon={Home}
                      >
                        <Field
                          label="Address line 1"
                          value={profile.current_address_line_1}
                          onChange={(value) => setProfile((previous) => ({ ...previous, current_address_line_1: value }))}
                        />
                        <Field
                          label="Address line 2"
                          value={profile.current_address_line_2}
                          onChange={(value) => setProfile((previous) => ({ ...previous, current_address_line_2: value }))}
                        />
                        <Field
                          label="City"
                          value={profile.current_address_city}
                          onChange={(value) => setProfile((previous) => ({ ...previous, current_address_city: value }))}
                        />
                        <Field
                          label="State"
                          value={profile.current_address_state}
                          onChange={(value) => setProfile((previous) => ({ ...previous, current_address_state: value }))}
                        />
                        <Field
                          label="ZIP / PIN code"
                          value={profile.current_address_zip}
                          onChange={(value) => setProfile((previous) => ({ ...previous, current_address_zip: value }))}
                        />
                        <Field
                          label="Country"
                          value={profile.current_address_country}
                          onChange={(value) => setProfile((previous) => ({ ...previous, current_address_country: value }))}
                        />
                      </ProfileSection>

                      <ProfileSection
                        title="Permanent address"
                        subtitle="Keep this aligned with your official address for payroll and HR records."
                        icon={BriefcaseBusiness}
                        action={
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-[#d56a43] hover:text-[#b25534]"
                            onClick={copyCurrentToPermanentAddress}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy current address
                          </button>
                        }
                      >
                        <Field
                          label="Address line 1"
                          value={profile.permanent_address_line_1}
                          onChange={(value) => setProfile((previous) => ({ ...previous, permanent_address_line_1: value }))}
                        />
                        <Field
                          label="Address line 2"
                          value={profile.permanent_address_line_2}
                          onChange={(value) => setProfile((previous) => ({ ...previous, permanent_address_line_2: value }))}
                        />
                        <Field
                          label="City"
                          value={profile.permanent_address_city}
                          onChange={(value) => setProfile((previous) => ({ ...previous, permanent_address_city: value }))}
                        />
                        <Field
                          label="State"
                          value={profile.permanent_address_state}
                          onChange={(value) => setProfile((previous) => ({ ...previous, permanent_address_state: value }))}
                        />
                        <Field
                          label="ZIP / PIN code"
                          value={profile.permanent_address_zip}
                          onChange={(value) => setProfile((previous) => ({ ...previous, permanent_address_zip: value }))}
                        />
                        <Field
                          label="Country"
                          value={profile.permanent_address_country}
                          onChange={(value) => setProfile((previous) => ({ ...previous, permanent_address_country: value }))}
                        />
                      </ProfileSection>
                    </div>

                    <ProfileSection
                      title="Family details"
                      subtitle="Additional personal details that are often required at the final joining stage."
                      icon={UserRound}
                    >
                      <Field
                        label="Father's name"
                        value={profile.father_name}
                        onChange={(value) => setProfile((previous) => ({ ...previous, father_name: value }))}
                      />
                      <Field
                        label="Mother's name"
                        value={profile.mother_name}
                        onChange={(value) => setProfile((previous) => ({ ...previous, mother_name: value }))}
                      />
                      <Field
                        label="Spouse name"
                        value={profile.spouse_name}
                        onChange={(value) => setProfile((previous) => ({ ...previous, spouse_name: value }))}
                      />
                      <TextArea
                        label="Children names"
                        value={profile.children_names}
                        onChange={(value) => setProfile((previous) => ({ ...previous, children_names: value }))}
                        placeholder="Optional"
                      />
                    </ProfileSection>
                  </div>
                )}
              </div>

              {readinessPanel}
            </section>
          </>
        ) : (
          <div className="section-card flex items-center gap-3 text-sm text-slate-600">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            Joining workspace could not be loaded.
          </div>
        )}
      </div>
    </main>
  );
}
