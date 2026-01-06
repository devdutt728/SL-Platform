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
            className="rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
          >
            Sign in
          </Link>
          <Link
            href="/apply"
            className="rounded-full border border-white/60 bg-white/40 px-5 py-2.5 text-sm font-semibold text-slate-800 backdrop-blur"
          >
            Apply to a role
          </Link>
        </div>
      </div>
    </main>
  );
}
