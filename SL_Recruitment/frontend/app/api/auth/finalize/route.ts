import {NextResponse, type NextRequest} from "next/server";
import crypto from "crypto";
import { getRequestOrigin } from "@/lib/request-origin";
import { popFinalizeToken } from "@/lib/oauth-memory";

export const runtime = "nodejs";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const defaultNextPath = basePath ? `${basePath}/dashboard` : "/dashboard";

function safeNextPath(raw: string | null) {
  if (!raw) return defaultNextPath;
  if (!raw.startsWith("/")) return defaultNextPath;
  if (raw.startsWith("//")) return defaultNextPath;
  if (basePath && !raw.startsWith(basePath)) return `${basePath}${raw}`;
  return raw;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });

  const idToken = popFinalizeToken(code);
  if (!idToken) return NextResponse.json({ error: "invalid_or_expired_code" }, { status: 400 });

  const nextPath = safeNextPath(url.searchParams.get("next"));
  const origin = process.env.PUBLIC_APP_ORIGIN || await getRequestOrigin(request.url);

  const response = NextResponse.redirect(new URL(nextPath, origin));
  const sessionId = crypto.randomBytes(16).toString("hex");
  const now = Date.now().toString();
  response.cookies.set("slp_token", idToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
  });
  response.cookies.set("slp_sid", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
  });
  response.cookies.set("slp_last", now, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
  });
  response.cookies.set("slp_session_init", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
  });
  return response;
}
