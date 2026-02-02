import { headers } from "next/headers";

function firstHeaderValue(value: string | null) {
  if (!value) return "";
  return value.split(",")[0]?.trim() || "";
}

function parseForwarded(value: string | null): { proto?: string; host?: string } {
  if (!value) return {};
  // Forwarded: for=1.2.3.4;proto=https;host=example.com
  const first = firstHeaderValue(value);
  const parts = first.split(";").map((p) => p.trim());
  const out: { proto?: string; host?: string } = {};
  for (const part of parts) {
    const [rawKey, rawVal] = part.split("=", 2);
    const key = (rawKey || "").trim().toLowerCase();
    const val = (rawVal || "").trim().replace(/^"|"$/g, "");
    if (key === "proto" && val) out.proto = val;
    if (key === "host" && val) out.host = val;
  }
  return out;
}

function isLocalHost(host: string) {
  return host === "localhost" || host.startsWith("localhost:") || host === "127.0.0.1" || host.startsWith("127.0.0.1:");
}

function isGoogleHost(host: string) {
  return host === "accounts.google.com" || host.endsWith(".google.com") || host.endsWith(".googleusercontent.com");
}

function normalizeTunnelHost(host: string) {
  if (!host) return host;
  // Dev tunnels already encode the port in the hostname (e.g. xxxx-3000.inc1.devtunnels.ms).
  // A literal :3000 in the origin breaks navigation on the public URL.
  if (host.endsWith(".devtunnels.ms:3000")) return host.replace(/:3000$/, "");
  return host;
}

export async function getRequestOrigin(requestUrl: string) {
  const url = new URL(requestUrl);
  const hdrs = await headers();

  const forwarded = parseForwarded(hdrs.get("forwarded"));
  const forwardedProto = firstHeaderValue(hdrs.get("x-forwarded-proto")) || firstHeaderValue(hdrs.get("x-original-proto"));
  const forwardedHost = firstHeaderValue(hdrs.get("x-forwarded-host")) || firstHeaderValue(hdrs.get("x-original-host"));

  const host = normalizeTunnelHost(forwardedHost || forwarded.host || hdrs.get("host") || url.host);
  const proto = forwardedProto || forwarded.proto || url.protocol.replace(":", "");

  const computedOrigin = `${proto}://${host}`;

  // Only trust Referer if it matches the computed host. (Google OAuth callbacks often have a Google referer.)
  const referer = firstHeaderValue(hdrs.get("referer"));
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === host) return refererUrl.origin;

      const hostIsLocal = isLocalHost(host);
      if (hostIsLocal && !isLocalHost(refererUrl.host) && !isGoogleHost(refererUrl.host)) {
        return refererUrl.origin;
      }
    } catch {
      // ignore
    }
  }

  return computedOrigin;
}
