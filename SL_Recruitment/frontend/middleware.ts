import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function normalizeOrigin(origin: string) {
  return origin.replace(/\/$/, "");
}

function originsMatch(a: string, b: string) {
  try {
    const aUrl = new URL(a);
    const bUrl = new URL(b);
    if (aUrl.hostname !== bUrl.hostname) return false;
    if (!aUrl.port || !bUrl.port) return true;
    return aUrl.port === bUrl.port;
  } catch {
    return a === b;
  }
}

export function middleware(request: NextRequest) {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || "dev";
  if (authMode !== "google") return NextResponse.next();

  const token = request.cookies.get("slr_token")?.value;
  const { pathname } = request.nextUrl;
  const publicOrigin = normalizeOrigin(process.env.PUBLIC_APP_ORIGIN || "");
  const basePath = request.nextUrl.basePath || process.env.NEXT_PUBLIC_BASE_PATH || "";
  const normalizedPath = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  const fullPath = basePath ? `${basePath}${normalizedPath}` : normalizedPath;
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const forwardedPort = request.headers.get("x-forwarded-port") || "";
  const hostWithPort = forwardedHost && !forwardedHost.includes(":") && forwardedPort ? `${forwardedHost}:${forwardedPort}` : forwardedHost;
  const forwardedProto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const requestOriginRaw = hostWithPort ? `${forwardedProto}://${hostWithPort}` : request.nextUrl.origin;
  const requestOrigin = normalizeOrigin(requestOriginRaw);
  const hasForwarded = request.headers.has("x-forwarded-host") || request.headers.has("x-forwarded-proto") || request.headers.has("x-forwarded-port");

  const isFile = /\.(.*)$/.test(normalizedPath);
  if (
    normalizedPath.startsWith("/_next") ||
    isFile ||
    normalizedPath === "/" ||
    normalizedPath === "/login" ||
    normalizedPath.startsWith("/apply") ||
    normalizedPath.startsWith("/caf") ||
    normalizedPath.startsWith("/assessment") ||
    normalizedPath.startsWith("/offer") ||
    normalizedPath.startsWith("/schedule") ||
    normalizedPath.startsWith("/sprint") ||
    normalizedPath.startsWith("/api/auth") ||
    normalizedPath.startsWith("/api/apply") ||
    normalizedPath.startsWith("/api/caf") ||
    normalizedPath.startsWith("/api/assessment") ||
    normalizedPath.startsWith("/api/sprint") ||
    normalizedPath.startsWith("/api/offer")
  ) {
    return NextResponse.next();
  }

  if (publicOrigin && hasForwarded && !normalizedPath.startsWith("/api/") && !originsMatch(requestOrigin, publicOrigin)) {
    const url = new URL(fullPath + request.nextUrl.search, publicOrigin);
    return NextResponse.redirect(url);
  }

  if (!token) {
    if (normalizedPath.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = `${basePath}/login`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
