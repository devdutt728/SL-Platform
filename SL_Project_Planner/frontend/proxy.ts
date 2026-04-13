import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function cookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecure,
    path: "/",
  };
}

function employeeUrl(request: NextRequest) {
  return new URL("/employee", request.url);
}

export function proxy(request: NextRequest) {
  const authMode =
    process.env.NEXT_PUBLIC_PLANNER_AUTH_MODE ||
    process.env.NEXT_PUBLIC_AUTH_MODE ||
    "dev";
  if (authMode !== "google") return NextResponse.next();

  const plannerToken = request.cookies.get("spp_token")?.value;
  const plannerSession = request.cookies.get("spp_sid")?.value;
  const plannerInit = request.cookies.get("spp_session_init")?.value;
  const sharedToken = request.cookies.get("slp_token")?.value;
  const sharedSession = request.cookies.get("slp_sid")?.value;
  const { pathname } = request.nextUrl;
  const basePath = request.nextUrl.basePath || process.env.NEXT_PUBLIC_BASE_PATH || "/planner";
  const normalizedPath = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  const isSecure = request.nextUrl.protocol === "https:";
  const hasSharedAuth = Boolean(sharedToken && sharedSession);
  const hasPlannerAuth = Boolean(plannerToken && plannerSession);
  const sharedDiffers =
    hasSharedAuth &&
    (!hasPlannerAuth || plannerToken !== sharedToken || plannerSession !== sharedSession);
  const token = hasSharedAuth ? sharedToken : plannerToken;
  const sessionId = hasSharedAuth ? sharedSession : plannerSession;
  const shouldBootstrap = Boolean(sharedDiffers);

  const isFile = /\.(.*)$/.test(normalizedPath);
  if (normalizedPath.startsWith("/_next") || isFile || normalizedPath === "/favicon.ico") {
    return NextResponse.next();
  }

  if (!token) {
    if (normalizedPath.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(employeeUrl(request));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("authorization", token.startsWith("Bearer ") ? token : `Bearer ${token}`);
  if (sessionId) requestHeaders.set("x-spp-session", sessionId);
  if (plannerInit || shouldBootstrap) requestHeaders.set("x-spp-session-init", "1");

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (shouldBootstrap) {
    response.cookies.set("spp_token", sharedToken!, cookieOptions(isSecure));
    response.cookies.set("spp_sid", sharedSession!, cookieOptions(isSecure));
    response.cookies.set("spp_session_init", "1", cookieOptions(isSecure));
  }
  if (plannerInit) {
    response.cookies.set("spp_session_init", "", { ...cookieOptions(isSecure), maxAge: 0 });
  }
  return response;
}

export const config = {
  matcher: ["/:path*"],
};
