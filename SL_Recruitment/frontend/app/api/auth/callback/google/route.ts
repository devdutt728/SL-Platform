import crypto from "crypto";
import {NextResponse, type NextRequest} from "next/server";
import { cookies } from "next/headers";
import { readGoogleOAuthSecrets } from "@/lib/google-oauth";
import { backendUrl } from "@/lib/backend";
import { getRequestOrigin } from "@/lib/request-origin";
import { deleteOAuthState, getOAuthState, putFinalizeToken } from "@/lib/oauth-memory";

export const runtime = "nodejs";

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

function isGoogleHost(host: string) {
  return host === "accounts.google.com" || host.endsWith(".google.com") || host.endsWith(".googleusercontent.com");
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = process.env.PUBLIC_APP_ORIGIN || await getRequestOrigin(request.url);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const nextPath = basePath ? `${basePath}/dashboard` : "/dashboard";
  const errorPath = basePath ? `${basePath}/auth/error` : "/auth/error";
  const redirectError = (code: string, status: number, detail?: string) => {
    const errorUrl = new URL(errorPath, origin);
    errorUrl.searchParams.set("code", code);
    errorUrl.searchParams.set("status", String(status));
    if (detail) errorUrl.searchParams.set("detail", detail.slice(0, 500));
    return NextResponse.redirect(errorUrl);
  };
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) return redirectError("google_oauth_error", 400, error);
    if (!code) return redirectError("missing_code", 400, "Missing OAuth code.");

    const cookieStore = await cookies();
    const expectedStateCookie = cookieStore.get("slr_oauth_state")?.value;
    const memory = state ? getOAuthState(state) : null;
    const stateOk = !!state && ((expectedStateCookie && expectedStateCookie === state) || !!memory);
    if (!stateOk) return redirectError("invalid_state", 400, "Invalid OAuth state.");

    const { clientId, clientSecret, tokenUri, redirectUris } = readGoogleOAuthSecrets();
    if (!clientId || !clientSecret) {
      return redirectError("missing_google_oauth_client", 500, "Missing Google OAuth client credentials.");
    }

    const defaultRedirectUri = `${origin}${basePath}/api/auth/callback/google`;
    const redirectUri =
      process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      cookieStore.get("slr_oauth_redirect_uri")?.value ||
      memory?.redirectUri ||
      redirectUris.find((u) => u.startsWith(origin)) ||
      defaultRedirectUri;

    const body = new URLSearchParams();
    body.set("code", code);
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
    body.set("redirect_uri", redirectUri);
    body.set("grant_type", "authorization_code");

    const tokenRes = await fetch(tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) {
      return redirectError("token_exchange_failed", tokenRes.status, tokenText);
    }

    let tokenJson: any = {};
    try {
      tokenJson = JSON.parse(tokenText);
    } catch {
      return redirectError("token_exchange_invalid_json", 401, "Invalid token response.");
    }

    const idToken = tokenJson.id_token as string | undefined;
    if (!idToken) return redirectError("missing_id_token", 401, "Missing id_token.");

    const sessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
    const now = Date.now().toString();
    const meRes = await fetch(backendUrl("/auth/me"), {
      headers: {
        authorization: `Bearer ${idToken}`,
        "x-slp-session": sessionId,
        "x-slp-session-init": "1",
      },
      cache: "no-store",
    });

    const meText = await meRes.text();
    if (!meRes.ok) {
      let detail = meText;
      try {
        const parsed = JSON.parse(meText);
        if (parsed && typeof parsed.detail === "string") {
          detail = parsed.detail;
        }
      } catch {
        // keep raw detail
      }
      return redirectError("backend_auth_failed", meRes.status, detail);
    }

    let returnToOrigin = memory?.returnToOrigin || origin;
    try {
      const returnUrl = new URL(returnToOrigin);
      if (isGoogleHost(returnUrl.hostname)) returnToOrigin = origin;
    } catch {
      returnToOrigin = origin;
    }
    if (state) deleteOAuthState(state);

    const clearOAuthCookies = (response: NextResponse) => {
      response.cookies.set("slr_oauth_state", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        path: "/",
        maxAge: 0,
      });
      response.cookies.set("slr_oauth_redirect_uri", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        path: "/",
        maxAge: 0,
      });
    };

    if (originsMatch(returnToOrigin, origin)) {
      const targetOrigin = returnToOrigin || origin;
      const response = NextResponse.redirect(new URL(nextPath, targetOrigin));
      response.cookies.set("slp_token", idToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: targetOrigin.startsWith("https://"),
        path: "/",
      });
      response.cookies.set("slp_sid", sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: targetOrigin.startsWith("https://"),
        path: "/",
      });
      response.cookies.set("slp_last", now, {
        httpOnly: true,
        sameSite: "lax",
        secure: targetOrigin.startsWith("https://"),
        path: "/",
      });
      response.cookies.set("slp_session_init", "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: targetOrigin.startsWith("https://"),
        path: "/",
      });
      clearOAuthCookies(response);
      return response;
    }

    const finalizeCode = `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    putFinalizeToken(finalizeCode, idToken);
    const finalizeUrl = new URL(`${basePath}/api/auth/finalize`, returnToOrigin);
    finalizeUrl.searchParams.set("code", finalizeCode);
    finalizeUrl.searchParams.set("next", nextPath);

    const response = NextResponse.redirect(finalizeUrl);
    clearOAuthCookies(response);
    return response;
  } catch (e: any) {
    return redirectError("callback_exception", 500, e?.message || String(e));
  }
}
