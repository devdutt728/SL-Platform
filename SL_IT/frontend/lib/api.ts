const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const API_BASE = `${basePath}/api`;

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "request_failed");
  }

  return response.json() as Promise<T>;
}
