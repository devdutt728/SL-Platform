import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("slp_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 0,
  });
  return response;
}
