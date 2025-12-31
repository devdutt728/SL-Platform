"use client";

import { useState } from "react";
import Link from "next/link";

declare global {
  interface Window {
    google?: any;
  }
}

export function LoginPanel({ clientId }: { clientId: string }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="section-card w-full max-w-md">
      <p className="text-xs uppercase tracking-tight text-[var(--text-secondary)]">Studio Lotus</p>
      <h1 className="mt-2 text-2xl font-semibold">Recruitment OS</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Sign in with your Studio Lotus Google account.</p>

      <div className="mt-6 flex justify-center">
        <a
          href={`${basePath}/api/auth/google/start`}
          className="inline-flex w-[320px] items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-2 text-sm font-semibold shadow-card hover:bg-[var(--surface-strong)]/80"
        >
          <GoogleMark className="h-4 w-4" />
          Sign in with Google
        </a>
      </div>

      {!clientId && (
        <p className="mt-4 text-sm text-red-400">
          Missing Google client_id (check `secrets/Oauth SL_Platform.json`).
        </p>
      )}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          Home
        </Link>
        <a
          className="text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          href="https://accounts.google.com/"
          target="_blank"
          rel="noreferrer"
        >
          Switch Google account
        </a>
      </div>
    </div>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 533.5 544.3"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M533.5 278.4c0-18.5-1.7-37.1-5.3-55.1H272.1v104.3h146.9c-6.1 33.4-25 61.7-53.2 80.5v66.1h86.1c50.5-46.5 81.6-115.1 81.6-195.8z"
        fill="#4285f4"
      />
      <path
        d="M272.1 544.3c72.6 0 133.6-24.1 178.1-65.9l-86.1-66.1c-23.9 16.2-54.6 25.5-92 25.5-70 0-129.4-47.2-150.7-110.6H32.4v69.6c45.6 90.5 139.4 147.5 239.7 147.5z"
        fill="#34a853"
      />
      <path
        d="M121.4 327.2c-11.2-33.4-11.2-69.3 0-102.7V155H32.4c-38.5 76.9-38.5 167.5 0 244.4l89-72.2z"
        fill="#fbbc04"
      />
      <path
        d="M272.1 106.7c39.5-.6 77.6 14.2 106.5 41.4l79.2-79.2C408.9 24.2 344.7-.4 272.1 0 171.8 0 78 57 32.4 147.5l89 69.6c21.3-63.4 80.7-110.6 150.7-110.6z"
        fill="#ea4335"
      />
    </svg>
  );
}
