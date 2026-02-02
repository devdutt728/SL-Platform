const backendBaseUrl =
  process.env.WORKBOOK_AUTH_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://127.0.0.1:8002";

export function backendUrl(path: string) {
  if (!path.startsWith("/")) return `${backendBaseUrl}/${path}`;
  return `${backendBaseUrl}${path}`;
}
