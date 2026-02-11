import Link from "next/link";
import { QuickStats } from "@/components/quick-stats";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="section-card">
        <p className="mt-2 text-steel max-w-2xl">
          Central workspace for IT helpdesk operations and future modules. Use the tabs to
          move between views without losing your context.
        </p>
      </section>
      <section className="section-card">
        <h2 className="text-lg font-semibold">Quick actions</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="px-5 py-2 rounded-full bg-brand text-white" href="/new">
            Create IT ticket
          </Link>
          <Link className="px-5 py-2 rounded-full border border-black/10" href="/my">
            View my tickets
          </Link>
        </div>
      </section>
      <QuickStats />
    </div>
  );
}
