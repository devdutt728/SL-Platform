import { headers } from "next/headers";

export function internalUrl(path: string) {
  const incomingHeaders = headers();
  const host = incomingHeaders.get("x-forwarded-host") || incomingHeaders.get("host") || "localhost:3000";
  const proto = incomingHeaders.get("x-forwarded-proto") || "http";
  const configuredOrigin = process.env.PUBLIC_APP_ORIGIN || "";
  const origin = configuredOrigin ? configuredOrigin.replace(/\/$/, "") : `${proto}://${host}`;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${basePath}${normalizedPath}`;
}


