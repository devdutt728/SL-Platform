import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  const origin = process.env.PUBLIC_APP_ORIGIN || getRequestOrigin(request.url);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("slr_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 0,
  });
  return response;
}
