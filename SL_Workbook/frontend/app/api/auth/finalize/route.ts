import { NextResponse } from "next/server";
import { popFinalizeToken } from "@/lib/oauth-memory";
import { getRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = url.searchParams.get("next") || "/employee";
  if (!code) return new NextResponse("Missing code", { status: 400 });

  const idToken = popFinalizeToken(code);
  if (!idToken) return new NextResponse("Invalid or expired code", { status: 400 });

  const origin = process.env.PUBLIC_APP_ORIGIN || (await getRequestOrigin(request.url));
  const response = NextResponse.redirect(new URL(nextPath, origin));
  response.cookies.set("slw_token", idToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
  });
  return response;
}
