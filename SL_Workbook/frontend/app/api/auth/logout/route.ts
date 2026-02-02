import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = process.env.PUBLIC_APP_ORIGIN || (await getRequestOrigin(request.url));
  const response = NextResponse.redirect(new URL("/", origin));
  response.cookies.set("slw_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 0,
  });
  return response;
}
