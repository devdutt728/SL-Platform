import {NextResponse, type NextRequest} from "next/server";
import { backendUrl } from "@/lib/backend";
import { getRequestOrigin } from "@/lib/request-origin";

export async function POST(request: NextRequest) {
  const origin = process.env.PUBLIC_APP_ORIGIN || await getRequestOrigin(request.url);
  const body = (await request.json()) as { credential?: string };
  const credential = body.credential;
  if (!credential) {
    return NextResponse.json({ error: "Missing credential" }, { status: 400 });
  }

  const res = await fetch(backendUrl("/auth/me"), {
    headers: { authorization: `Bearer ${credential}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return new NextResponse(text || "Unauthorized", { status: res.status });
  }

  const me = await res.json();
  const response = NextResponse.json(me);
  response.cookies.set("slr_token", credential, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
  });
  return response;
}
