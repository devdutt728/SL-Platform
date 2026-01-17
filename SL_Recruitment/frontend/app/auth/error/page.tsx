import Link from "next/link";

type AuthErrorPageProps = {
  searchParams?: {
    code?: string;
    status?: string;
    detail?: string;
  };
};

export const metadata = {
  title: "Access Restricted | SL Recruitment",
  description: "Authentication error",
};

export default function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const code = searchParams?.code || "unknown_error";
  const status = searchParams?.status || "0";
  const detail =
    searchParams?.detail ||
    "We could not complete the sign-in. Please try again or contact IT support.";

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="page-shell flex min-h-screen items-center justify-center py-16">
        <div className="relative w-full max-w-5xl">
          <div className="absolute -left-10 top-10 hidden h-32 w-32 rounded-full border border-cyan-200/50 bg-cyan-200/20 blur-2xl lg:block" />
          <div className="absolute -right-10 bottom-10 hidden h-40 w-40 rounded-full border border-emerald-200/40 bg-emerald-200/20 blur-3xl lg:block" />

          <div className="glass-panel relative overflow-hidden p-10 sm:p-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.2),_transparent_55%)]" />
            <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-cyan-300/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-300/40 to-transparent" />

            <div className="relative z-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="motion-fade-up">
                <div className="inline-flex items-center gap-3 rounded-full border border-cyan-200/60 bg-cyan-50/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                  Access Restricted
                </div>
                <h1 className="mt-5 text-3xl font-semibold text-slate-900 sm:text-4xl">
                  Your sign-in stopped mid-flight.
                </h1>
                <p className="mt-4 text-base text-slate-600">
                  The secure gateway blocked this request. We logged the event and kept
                  your session clean.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href={`${basePath}/api/auth/google/start`}
                    className="workbook-launch inline-flex items-center justify-center px-5 py-2 text-sm font-semibold"
                  >
                    Retry Google sign-in
                  </a>
                  <Link
                    href={`${basePath}/login`}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/80 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
                  >
                    Back to login
                  </Link>
                </div>

                <div className="mt-6 text-xs text-slate-500">
                  If this keeps happening, ask IT to verify your account access or
                  domain allowlist.
                </div>
              </div>

              <div className="relative motion-fade-up">
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-6 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    System Trace
                  </div>
                  <div className="mt-5 space-y-4 text-sm text-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Signal code</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-slate-700">
                        {code}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Status</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-slate-700">
                        {status}
                      </span>
                    </div>
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600">
                      {detail}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 rounded-2xl border border-slate-200/80 bg-white/60 p-5 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Secure handoff</span>
                    <span className="font-semibold text-emerald-600">Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Session integrity</span>
                    <span className="font-semibold text-emerald-600">Preserved</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Next action</span>
                    <span className="font-semibold text-slate-700">Retry login</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
