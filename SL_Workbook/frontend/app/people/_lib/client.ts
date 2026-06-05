"use client";

// Thin client over the /api/ppl/* catch-all proxy. All calls are same-origin;
// the proxy attaches the auth cookie and forwards to the People backend (8004).

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/ppl${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const pplGet = <T>(path: string) => request<T>(path);
export const pplPatch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const pplPost = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });
export const pplPut = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const pplDelete = <T>(path: string) => request<T>(path, { method: "DELETE" });

export function exportUrl(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  return `/api/ppl/employees/export?${qs.toString()}`;
}
