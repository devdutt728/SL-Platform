"use client";

type UxMetricPayload = {
  event_name: string;
  page?: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  occurred_at?: string;
};

export function trackUxMetric(payload: UxMetricPayload) {
  try {
    const body = JSON.stringify({
      ...payload,
      page: payload.page || window.location.pathname,
      occurred_at: payload.occurred_at || new Date().toISOString(),
    });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/rec/ux-metrics", blob);
      return;
    }
    void fetch("/api/rec/ux-metrics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Metric capture must never block UX.
  }
}
