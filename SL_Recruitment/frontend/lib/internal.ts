import { headers } from "next/headers";

export async function internalUrl(path: string) {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get("x-forwarded-host") || incomingHeaders.get("host") || "localhost:3000";
  const proto = incomingHeaders.get("x-forwarded-proto") || "http";
  const configuredOrigin = process.env.PUBLIC_APP_ORIGIN || "";
  let origin = `${proto}://${host}`;
  let basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment";
  if (configuredOrigin) {
    try {
      const url = new URL(configuredOrigin);
      const normalizedPath = url.pathname.replace(/\/$/, "");
      origin = `${url.origin}${normalizedPath}`;
      if (normalizedPath && normalizedPath !== "/") {
        basePath = "";
      }
    } catch {
      origin = configuredOrigin.replace(/\/$/, "");
    }
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${basePath}${normalizedPath}`;
}



