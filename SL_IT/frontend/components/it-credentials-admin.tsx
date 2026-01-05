"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

type Credential = {
  credential_id: number;
  label: string;
  username: string;
  notes?: string | null;
  is_active: boolean;
  last_rotated_at?: string | null;
};

type License = {
  license_id: number;
  name: string;
};

export function ItCredentialsAdmin() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [form, setForm] = useState({
    label: "",
    username: "",
    password: "",
    notes: "",
  });
  const [linkForm, setLinkForm] = useState({ license_id: "", credential_id: "" });
  const [revealed, setRevealed] = useState<Record<number, string>>({});

  const loadCredentials = () => {
    apiFetch<Credential[]>("/it/admin/credentials")
      .then(setCredentials)
      .catch(() => setCredentials([]));
  };

  const loadLicenses = () => {
    apiFetch<License[]>("/it/admin/licenses")
      .then(setLicenses)
      .catch(() => setLicenses([]));
  };

  useEffect(() => {
    loadCredentials();
    loadLicenses();
  }, []);

  const createCredential = async () => {
    if (!form.label.trim() || !form.username.trim() || !form.password.trim()) return;
    await apiFetch("/it/admin/credentials", {
      method: "POST",
      body: JSON.stringify({
        label: form.label.trim(),
        username: form.username.trim(),
        password: form.password,
        notes: form.notes || null,
        is_active: true,
      }),
    });
    setForm({ label: "", username: "", password: "", notes: "" });
    loadCredentials();
  };

  const revealPassword = async (credentialId: number) => {
    const data = await apiFetch<{ password: string }>(`/it/admin/credentials/${credentialId}/reveal`);
    setRevealed((prev) => ({ ...prev, [credentialId]: data.password }));
  };

  const linkCredential = async () => {
    if (!linkForm.license_id || !linkForm.credential_id) return;
    await apiFetch(`/it/admin/licenses/${linkForm.license_id}/credentials/${linkForm.credential_id}`, {
      method: "POST",
    });
    setLinkForm({ license_id: "", credential_id: "" });
  };

  return (
    <div className="space-y-6">
      <section className="section-card">
        <h2 className="text-xl font-semibold">Add credential</h2>
        <p className="mt-2 text-sm text-steel">
          Passwords are encrypted in the database. Keep labels precise (e.g., “Adobe Admin”).
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Label"
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Username / email"
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
          />
          <input
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            placeholder="Password"
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </div>
        <textarea
          className="mt-3 w-full rounded-xl border border-black/10 bg-white px-4 py-2"
          placeholder="Notes"
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
        <button className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white" onClick={createCredential}>
          Save credential
        </button>
      </section>

      <section className="section-card">
        <h2 className="text-xl font-semibold">Link credential to license</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            value={linkForm.license_id}
            onChange={(event) => setLinkForm({ ...linkForm, license_id: event.target.value })}
          >
            <option value="">Select license</option>
            {licenses.map((license) => (
              <option key={license.license_id} value={license.license_id}>
                {license.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-black/10 bg-white px-4 py-2"
            value={linkForm.credential_id}
            onChange={(event) => setLinkForm({ ...linkForm, credential_id: event.target.value })}
          >
            <option value="">Select credential</option>
            {credentials.map((credential) => (
              <option key={credential.credential_id} value={credential.credential_id}>
                {credential.label}
              </option>
            ))}
          </select>
        </div>
        <button className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white" onClick={linkCredential}>
          Link
        </button>
      </section>

      <section className="section-card">
        <h2 className="text-xl font-semibold">Credentials</h2>
        <div className="mt-4 grid gap-3">
          {credentials.map((credential) => (
            <div key={credential.credential_id} className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{credential.label}</div>
                  <div className="text-xs text-steel">{credential.username}</div>
                </div>
                <button
                  className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold"
                  onClick={() => revealPassword(credential.credential_id)}
                >
                  Reveal
                </button>
              </div>
              {revealed[credential.credential_id] && (
                <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                  {revealed[credential.credential_id]}
                </div>
              )}
            </div>
          ))}
          {!credentials.length && <div className="text-sm text-steel">No credentials yet.</div>}
        </div>
      </section>
    </div>
  );
}
