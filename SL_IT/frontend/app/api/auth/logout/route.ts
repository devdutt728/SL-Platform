import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("slp_token")?.value;
  const sessionId = request.cookies.get("slp_sid")?.value;
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
  const response = NextResponse.json({ ok: true });
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 0,
  };
  response.cookies.set("slp_token", "", cookieOptions);
  response.cookies.set("slp_sid", "", cookieOptions);
  response.cookies.set("slp_last", "", cookieOptions);
  response.cookies.set("slp_session_init", "", cookieOptions);
  return response;
}
