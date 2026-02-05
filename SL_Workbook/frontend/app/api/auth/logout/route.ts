import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";
import { backendUrl } from "@/lib/backend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = process.env.PUBLIC_APP_ORIGIN || (await getRequestOrigin(request.url));
  const cookieStore = await cookies();
  const token = cookieStore.get("slp_token")?.value;
  const sessionId = cookieStore.get("slp_sid")?.value;
  if (token && sessionId) {
    try {
      await fetch(backendUrl("/auth/logout"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "x-slp-session": sessionId,
        },
      });
    } catch {
      // ignore logout errors
    }
  }
  const response = NextResponse.redirect(new URL("/", origin));
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 0,
  };
  response.cookies.set("slp_token", "", cookieOptions);
  response.cookies.set("slp_sid", "", cookieOptions);
  response.cookies.set("slp_last", "", cookieOptions);
  response.cookies.set("slp_session_init", "", cookieOptions);
  return response;
}
