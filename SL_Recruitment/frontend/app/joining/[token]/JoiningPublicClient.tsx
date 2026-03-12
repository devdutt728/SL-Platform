"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { JoiningDocsPublicContext, JoiningProfilePublic } from "@/lib/types";

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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "date";
}) {
  return (
    <label className="space-y-1 text-xs text-slate-600">
      <span>{label}</span>
      <input
        type={type}
        className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-800"
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
    <label className="space-y-1 text-xs text-slate-600 md:col-span-2">
      <span>{label}</span>
      <textarea
        className="min-h-24 w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-800"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value?: string | null;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="space-y-1 text-xs text-slate-600">
      <span>{label}</span>
      <select
        className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-800"
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

export function JoiningPublicClient({ token }: Props) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const searchParams = useSearchParams();
  const [context, setContext] = useState<JoiningDocsPublicContext | null>(null);
  const [profile, setProfile] = useState<JoiningProfilePublic>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState(DOC_TYPES[0].value);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const requiredSet = useMemo(() => new Set(context?.required_doc_types || []), [context?.required_doc_types]);
  const uploadedTypes = useMemo(() => new Set((context?.docs || []).map((doc) => doc.doc_type)), [context?.docs]);
  const linkExp = (searchParams.get("exp") || "").trim();
  const linkSig = (searchParams.get("sig") || "").trim();
  const signedQuery = linkExp && linkSig
    ? `?exp=${encodeURIComponent(linkExp)}&sig=${encodeURIComponent(linkSig)}`
    : "";

  const loadContext = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/joining/${encodeURIComponent(token)}${signedQuery}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as JoiningDocsPublicContext;
      setContext(data);
      setProfile(normalizeProfile(data.profile));
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
      const res = await fetch(`${basePath}/api/joining/${encodeURIComponent(token)}/upload${signedQuery}`, {
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

  const saveProfile = async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    setError(null);
    setProfileNotice(null);
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
      if (!res.ok) throw new Error(await res.text());
      setProfileNotice("Profile saved. HR will review these details before final hire.");
      await loadContext();
    } catch (err: any) {
      setError(err?.message || "Profile save failed. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    void loadContext();
  }, [signedQuery]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-4 py-10">
      <div className="section-card space-y-2">
        <p className="text-xs uppercase tracking-tight text-slate-600">Joining documents</p>
        <h1 className="text-3xl font-semibold">
          {context?.candidate_name ? `Welcome, ${context.candidate_name}` : "Welcome"}
        </h1>
        <p className="text-sm text-slate-600">
          {context?.opening_title ? `Role: ${context.opening_title}` : "Please upload your joining documents and complete your joining profile."}
        </p>
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {profileNotice ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{profileNotice}</div> : null}

      {loading ? (
        <div className="section-card text-sm text-slate-600">Loading documents...</div>
      ) : context ? (
        <>
          <div className="section-card space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                Docs: {context.joining_docs_status}
              </span>
              <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                Profile: {profile.profile_status || "draft"}
              </span>
              <span className="text-xs text-slate-500">Upload files and submit profile once. HR will verify PAN and Aadhaar before final hire.</span>
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

          <div className="section-card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Joining profile</p>
                <p className="text-xs text-slate-500">Fill the personal details once so HR does not retype them manually.</p>
              </div>
              <button
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => void saveProfile()}
                disabled={savingProfile}
              >
                {savingProfile ? "Saving..." : "Save profile"}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="PAN number" value={profile.personal_id} onChange={(value) => setProfile((prev) => ({ ...prev, personal_id: value.toUpperCase() }))} placeholder="ABCDE1234F" />
              <Field label="Aadhaar number" value={profile.aadhaar_number} onChange={(value) => setProfile((prev) => ({ ...prev, aadhaar_number: value }))} placeholder="12 digit Aadhaar" />
              <Field label="Middle name" value={profile.middle_name} onChange={(value) => setProfile((prev) => ({ ...prev, middle_name: value }))} />
              <Field label="Date of birth" type="date" value={profile.date_of_birth} onChange={(value) => setProfile((prev) => ({ ...prev, date_of_birth: value }))} />
              <SelectField label="Gender" value={profile.gender} onChange={(value) => setProfile((prev) => ({ ...prev, gender: value }))} options={["Male", "Female", "Non-binary", "Prefer not to say"]} />
              <SelectField label="Marital status" value={profile.marital_status} onChange={(value) => setProfile((prev) => ({ ...prev, marital_status: value }))} options={["Single", "Married", "Divorced", "Widowed"]} />
              <Field label="Marriage date" type="date" value={profile.marriage_date} onChange={(value) => setProfile((prev) => ({ ...prev, marriage_date: value }))} />
              <Field label="Blood group" value={profile.blood_group} onChange={(value) => setProfile((prev) => ({ ...prev, blood_group: value }))} placeholder="B+" />
              <SelectField label="Physically handicapped" value={profile.physically_handicapped} onChange={(value) => setProfile((prev) => ({ ...prev, physically_handicapped: value }))} options={["No", "Yes"]} />
              <Field label="Nationality" value={profile.nationality} onChange={(value) => setProfile((prev) => ({ ...prev, nationality: value }))} placeholder="Indian" />
              <Field label="Personal mobile number" value={profile.mobile_number} onChange={(value) => setProfile((prev) => ({ ...prev, mobile_number: value }))} placeholder="+91..." />
              <Field label="Personal email" type="email" value={profile.personal_email} onChange={(value) => setProfile((prev) => ({ ...prev, personal_email: value }))} placeholder="name@gmail.com" />
              <Field label="PF number" value={profile.pf_number} onChange={(value) => setProfile((prev) => ({ ...prev, pf_number: value }))} />
              <Field label="UAN number" value={profile.uan_number} onChange={(value) => setProfile((prev) => ({ ...prev, uan_number: value }))} />
            </div>
          </div>

          <div className="section-card space-y-4">
            <p className="text-sm font-semibold text-slate-800">Current address</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Address line 1" value={profile.current_address_line_1} onChange={(value) => setProfile((prev) => ({ ...prev, current_address_line_1: value }))} />
              <Field label="Address line 2" value={profile.current_address_line_2} onChange={(value) => setProfile((prev) => ({ ...prev, current_address_line_2: value }))} />
              <Field label="City" value={profile.current_address_city} onChange={(value) => setProfile((prev) => ({ ...prev, current_address_city: value }))} />
              <Field label="State" value={profile.current_address_state} onChange={(value) => setProfile((prev) => ({ ...prev, current_address_state: value }))} />
              <Field label="ZIP / PIN code" value={profile.current_address_zip} onChange={(value) => setProfile((prev) => ({ ...prev, current_address_zip: value }))} />
              <Field label="Country" value={profile.current_address_country} onChange={(value) => setProfile((prev) => ({ ...prev, current_address_country: value }))} />
            </div>
          </div>

          <div className="section-card space-y-4">
            <p className="text-sm font-semibold text-slate-800">Permanent address</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Address line 1" value={profile.permanent_address_line_1} onChange={(value) => setProfile((prev) => ({ ...prev, permanent_address_line_1: value }))} />
              <Field label="Address line 2" value={profile.permanent_address_line_2} onChange={(value) => setProfile((prev) => ({ ...prev, permanent_address_line_2: value }))} />
              <Field label="City" value={profile.permanent_address_city} onChange={(value) => setProfile((prev) => ({ ...prev, permanent_address_city: value }))} />
              <Field label="State" value={profile.permanent_address_state} onChange={(value) => setProfile((prev) => ({ ...prev, permanent_address_state: value }))} />
              <Field label="ZIP / PIN code" value={profile.permanent_address_zip} onChange={(value) => setProfile((prev) => ({ ...prev, permanent_address_zip: value }))} />
              <Field label="Country" value={profile.permanent_address_country} onChange={(value) => setProfile((prev) => ({ ...prev, permanent_address_country: value }))} />
            </div>
          </div>

          <div className="section-card space-y-4">
            <p className="text-sm font-semibold text-slate-800">Family details</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Father's name" value={profile.father_name} onChange={(value) => setProfile((prev) => ({ ...prev, father_name: value }))} />
              <Field label="Mother's name" value={profile.mother_name} onChange={(value) => setProfile((prev) => ({ ...prev, mother_name: value }))} />
              <Field label="Spouse name" value={profile.spouse_name} onChange={(value) => setProfile((prev) => ({ ...prev, spouse_name: value }))} />
              <TextArea label="Children names" value={profile.children_names} onChange={(value) => setProfile((prev) => ({ ...prev, children_names: value }))} placeholder="Optional" />
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
