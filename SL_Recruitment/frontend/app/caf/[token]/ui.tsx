"use client";

import { CafPrefill, Screening } from "@/lib/types";

type CafFormProps = {
  prefill: CafPrefill;
  screening?: Screening | null;
};

const readOnlyCardClass =
  "rounded-2xl border border-[var(--accessible-components--dark-grey)] bg-slate-100/85 px-4 py-3";

export function CafForm({ prefill, screening }: CafFormProps) {
  const willingToRelocate =
    screening?.willing_to_relocate == null ? "—" : screening.willing_to_relocate ? "Yes" : "No";

  return (
    <section className="overflow-hidden rounded-[30px] border border-[var(--accessible-components--dark-grey)] bg-white shadow-[var(--shadow-soft)]">
      <div className="border-b border-[var(--accessible-components--dark-grey)] bg-[rgba(231,64,17,0.06)] px-5 py-4 sm:px-6 sm:py-5">
        <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--light-grey)]">Submitted Form Details</p>
        <p className="mt-1 text-[15px] font-semibold text-[var(--dim-grey)]">
          Read-only snapshot from your submitted application
        </p>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:p-6">
        <ReadOnlyField label="First Name" value={(prefill.first_name || "").trim() || prefill.name} />
        <ReadOnlyField label="Last Name" value={(prefill.last_name || "").trim() || "—"} />
        <ReadOnlyField label="Email" value={prefill.email} />
        <ReadOnlyField label="Phone" value={prefill.phone || "—"} />
        <ReadOnlyField label="Years of Exp" value={formatYears(prefill.years_of_experience)} />
        <ReadOnlyField label="City" value={prefill.city || "—"} />
        <ReadOnlyField label="Willing to Relocate" value={willingToRelocate} />
        <ReadOnlyField label="Candidate Code" value={prefill.candidate_code} />
      </div>
    </section>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className={readOnlyCardClass}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--light-grey)]">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-[var(--dim-grey)]">{value}</p>
    </div>
  );
}

function formatYears(value: number | null | undefined) {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : String(value);
}
