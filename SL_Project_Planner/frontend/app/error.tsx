"use client";

export default function PlannerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f4efe8" }}>
      <div style={{ maxWidth: 720, width: "100%", background: "white", border: "1px solid #e8ddd1", borderRadius: 24, padding: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a5a3c" }}>
          Planner Error
        </div>
        <h1 style={{ margin: "10px 0 12px", fontSize: 32, lineHeight: 1.1 }}>Planner could not complete sign-in.</h1>
        <p style={{ margin: 0, color: "#5d5552", lineHeight: 1.6 }}>
          {error.message || "The planner backend failed while resolving your session."}
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{ border: "none", borderRadius: 12, background: "#c45d2c", color: "white", fontWeight: 700, padding: "12px 16px", cursor: "pointer" }}
          >
            Retry
          </button>
          <a
            href="/employee"
            style={{ display: "inline-flex", alignItems: "center", borderRadius: 12, border: "1px solid #d9ccc0", color: "#241915", padding: "12px 16px", textDecoration: "none", fontWeight: 700 }}
          >
            Back to Workbook
          </a>
        </div>
      </div>
    </main>
  );
}
