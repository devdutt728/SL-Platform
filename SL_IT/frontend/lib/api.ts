const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/it";
export const API_BASE = `${basePath}/api`;

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const body = options.body as any;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...Object.fromEntries(headers),
    },
    credentials: "include",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "request_failed");
  }

  return response.json() as Promise<T>;
}
