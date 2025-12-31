import { requireCandidateAccess } from "@/lib/require-candidate-access";

const slots = [
  { day: "Monday", times: ["10:00", "12:00", "16:00"] },
  { day: "Tuesday", times: ["11:00", "15:00"] },
  { day: "Wednesday", times: ["09:30", "14:30", "17:30"] },
];

export default async function SchedulePage({ params }: { params: { token: string } }) {
  await requireCandidateAccess(params.token);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 px-4 py-10">
      <div className="section-card">
        <p className="text-xs uppercase tracking-tight text-slate-600">Schedule your interview</p>
        <h1 className="text-2xl font-semibold">Pick a slot</h1>
        <p className="text-xs text-slate-600">Token: {params.token}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {slots.map((slot) => (
          <div key={slot.day} className="section-card p-4">
            <p className="text-sm font-semibold">{slot.day}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {slot.times.map((time) => (
                <button key={time} className="rounded-xl border border-white/60 bg-white/20 px-3 py-2 text-sm text-slate-800 hover:border-violet-400/70 hover:bg-white/30">
                  {time}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
