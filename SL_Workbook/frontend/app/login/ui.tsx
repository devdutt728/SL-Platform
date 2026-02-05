"use client";

import Image from "next/image";

export function EmployeeLoginPanel({ clientId, errorCode, detail }: { clientId: string; errorCode?: string; detail?: string }) {
  const logoSrc = "/studio-lotus-logo.png";
  const error =
    errorCode === "backend_auth_failed"
      ? "Access restricted. Contact your admin to enable your account."
      : errorCode === "invalid_state"
        ? "Your sign-in session expired. Please try again."
        : errorCode
          ? "Sign-in failed. Please try again."
          : null;

  return (
    <div className="public-panel w-full max-w-md">
      <div className="relative mx-auto mb-6 h-12 w-48">
        <Image src={logoSrc} alt="Studio Lotus" fill sizes="192px" className="object-contain" priority />
      </div>
      <div className="text-center">
        <p className="public-kicker">Employee access</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Studio Lotus Platform</h1>
        <p className="mt-3 text-sm text-slate-600">
          Sign in with your Studio Lotus Google account to open the internal console.
        </p>
      </div>

      {error && (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-left text-sm text-rose-700">
          <p className="font-semibold">Access restricted</p>
          <p className="mt-1">{error}</p>
          {detail ? <p className="mt-2 text-xs text-rose-600">Reason: {detail}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/api/auth/google/start" className="public-button public-button--primary">
              Retry sign in
            </a>
            <a href="/" className="public-button public-button--ghost">
              Back to public portal
            </a>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <a
          href="/api/auth/google/start"
          className="public-button public-button--primary"
        >
          Sign in with Google
        </a>
        <a href="/" className="public-button public-button--ghost">
          Back to public portal
        </a>
      </div>

      {!clientId && (
        <p className="mt-4 text-sm text-rose-500">
          Missing Google client_id (check `secrets/Oauth SL_Platform.json`).
        </p>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Protected by Google Workspace and platform access rules.
      </p>
    </div>
  );
}
