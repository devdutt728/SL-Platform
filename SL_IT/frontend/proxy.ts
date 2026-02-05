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

function cookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecure,
    path: "/",
  };
}

export function proxy(request: NextRequest) {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || "dev";
  if (authMode !== "google") return NextResponse.next();

  const token = request.cookies.get("slp_token")?.value;
  const sessionId = request.cookies.get("slp_sid")?.value;
  const sessionInit = request.cookies.get("slp_session_init")?.value;
  const lastSeenRaw = request.cookies.get("slp_last")?.value;
  const { pathname } = request.nextUrl;
  const publicOrigin = normalizeOrigin(process.env.PUBLIC_APP_ORIGIN || "");
  const publicPortalPath = process.env.PUBLIC_PORTAL_PATH || process.env.NEXT_PUBLIC_PUBLIC_PORTAL_PATH || "/";
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
  const now = Date.now();
  const lastSeen = lastSeenRaw ? Number(lastSeenRaw) : 0;
  const idleMinutes = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES || process.env.SESSION_IDLE_MINUTES || "15");
  const idleMs = Number.isFinite(idleMinutes) ? idleMinutes * 60 * 1000 : 0;
  const isSecure = requestOrigin.startsWith("https://");

  const isFile = /\.(.*)$/.test(normalizedPath);
  if (
    normalizedPath.startsWith("/_next") ||
    isFile ||
    normalizedPath === "/login" ||
    normalizedPath.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  if (token && idleMs > 0 && lastSeen && now - lastSeen > idleMs) {
    const url = request.nextUrl.clone();
    url.pathname = publicPortalPath;
    url.search = "";
    const response = NextResponse.redirect(url);
    const options = { ...cookieOptions(isSecure), maxAge: 0 };
    response.cookies.set("slp_token", "", options);
    response.cookies.set("slp_sid", "", options);
    response.cookies.set("slp_last", "", options);
    response.cookies.set("slp_session_init", "", options);
    return response;
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

  const requestHeaders = new Headers(request.headers);
  if (sessionId) requestHeaders.set("x-slp-session", sessionId);
  if (sessionInit) requestHeaders.set("x-slp-session-init", "1");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set("slp_last", now.toString(), cookieOptions(isSecure));
  if (sessionInit) {
    response.cookies.set("slp_session_init", "", { ...cookieOptions(isSecure), maxAge: 0 });
  }
  return response;
}

export const config = {
  matcher: ["/:path*"],
};
