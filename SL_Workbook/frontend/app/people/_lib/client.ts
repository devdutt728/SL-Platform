"use client";

// Thin client over the /api/ppl/* catch-all proxy. All calls are same-origin;
// the proxy attaches the auth cookie and forwards to the People backend (8004).

const REQUEST_TIMEOUT_MS = 20_000;

let redirectingToLogin = false;

/** Navigate the browser to the login page once, even if several requests 401 at once. */
function redirectToLogin() {
  if (typeof window === "undefined" || redirectingToLogin) return;
  redirectingToLogin = true;
  const here = window.location.pathname + window.location.search;
  const next = encodeURIComponent(here);
  window.location.assign(`/login?next=${next}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api/ppl${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
      signal: init?.signal || controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 401) {
    // Session expired / not authenticated. Force a full navigation to /login so
    // middleware (proxy.ts) and the login flow take over, instead of leaving the
    // user on a stale page that only recovers on manual refresh.
    redirectToLogin();
    throw new Error("Your session has expired. Redirecting to sign in…");
  }
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
