import Link from "next/link";
import { PeopleHeader } from "./PeopleHeader";

export function PeopleAccessRequired({
  title = "Superadmin access required",
  message = "This People area is restricted to platform superadmins. Sign in with a superadmin account or ask an existing superadmin to update your access.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="page-shell min-h-screen pb-12 pt-24">
      <PeopleHeader />
      <div className="mx-auto flex min-h-[55vh] w-full max-w-[960px] items-center justify-center">
        <section className="w-full rounded-2xl border border-[var(--border-soft)] bg-white p-8 shadow-[var(--shadow-soft)]">
          <p className="public-kicker">Access control</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-steel">{message}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/people" className="ppl-btn ppl-btn--primary">
              People home
            </Link>
            <a href="/api/auth/login" className="ppl-btn ppl-btn--ghost">
              Sign in again
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
