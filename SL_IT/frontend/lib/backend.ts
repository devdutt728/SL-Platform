const backendBaseUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export function backendUrl(path: string) {
  if (!path.startsWith("/")) return `${backendBaseUrl}/${path}`;
  return `${backendBaseUrl}${path}`;
}
