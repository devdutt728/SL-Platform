export function QuickStats() {
  const stats = [
    { label: "Open IT tickets", value: "12" },
    { label: "Waiting on user", value: "5" },
    { label: "SLA at risk", value: "2" },
    { label: "Resolved today", value: "4" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="section-card">
          <div className="text-sm text-steel">{stat.label}</div>
          <div className="mt-2 text-3xl font-semibold">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}
