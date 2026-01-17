import Link from "next/link";

export default function HomePage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const logoSrc = `${basePath}/Studio Lotus Logo (TM).png`;
  if (process.env.NEXT_PUBLIC_AUTH_MODE === "google") {
    // Still show the homepage for public /apply links; keep /recruitment gated by middleware.
  }

  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12">
      <div className="section-card max-w-xl text-center">
        <div className="mx-auto mb-4 h-12 w-48">
          <img src={logoSrc} alt="Studio Lotus" className="h-full w-full object-contain" />
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Welcome to the hiring OS</h1>
        <p className="mt-4 text-slate-600">Sign in to access the recruitment workspace.</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="workbook-launch inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold"
          >
            Sign in
          </Link>
          <Link
            href="/apply"
            className="workbook-launch inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold"
          >
            Apply to a role
          </Link>
          <a
            href="/"
            className="workbook-launch inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold"
          >
            Open Workbook
          </a>
        </div>
      </div>
    </main>
  );
}
