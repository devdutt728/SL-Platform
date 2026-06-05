const peopleBaseUrl = process.env.PEOPLE_BACKEND_URL || "http://127.0.0.1:8004";

export function peopleBackendUrl(path: string) {
  if (!path.startsWith("/")) return `${peopleBaseUrl}/${path}`;
  return `${peopleBaseUrl}${path}`;
}
