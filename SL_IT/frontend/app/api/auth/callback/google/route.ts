import { NextResponse } from "next/server";
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


export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.PUBLIC_APP_ORIGIN || getRequestOrigin(request.url);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const nextPath = basePath ? `${basePath}/` : "/";
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) return new NextResponse(`Google OAuth error: ${error}`, { status: 400 });
    if (!code) return new NextResponse("Missing code", { status: 400 });

    const expectedStateCookie = cookies().get("slp_oauth_state")?.value;
    const memory = state ? getOAuthState(state) : null;
    const stateOk = !!state && ((expectedStateCookie && expectedStateCookie === state) || !!memory);
    if (!stateOk) return new NextResponse("Invalid state", { status: 400 });

    const { clientId, clientSecret, tokenUri, redirectUris } = readGoogleOAuthSecrets();
    if (!clientId || !clientSecret) return new NextResponse("Missing Google OAuth client credentials", { status: 500 });

    const defaultRedirectUri = `${origin}${basePath}/api/auth/callback/google`;
    const redirectUri =
      process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      cookies().get("slp_oauth_redirect_uri")?.value ||
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
      return NextResponse.json(
        {
          error: "token_exchange_failed",
          status: tokenRes.status,
          redirectUri,
          tokenUri,
          body: tokenText,
        },
        { status: 401 }
      );
    }

    let tokenJson: any = {};
    try {
      tokenJson = JSON.parse(tokenText);
    } catch {
      return NextResponse.json(
        { error: "token_exchange_invalid_json", redirectUri, tokenUri, body: tokenText },
        { status: 401 }
      );
    }

    const idToken = tokenJson.id_token as string | undefined;
    if (!idToken) return NextResponse.json({ error: "missing_id_token", tokenJson }, { status: 401 });

    const meRes = await fetch(backendUrl("/auth/me"), {
      headers: { authorization: `Bearer ${idToken}` },
      cache: "no-store",
    });

    const meText = await meRes.text();
    if (!meRes.ok) {
      return NextResponse.json(
        { error: "backend_auth_failed", status: meRes.status, body: meText },
        { status: 401 }
      );
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
      response.cookies.set("slp_oauth_state", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        path: "/",
        maxAge: 0,
      });
      response.cookies.set("slp_oauth_redirect_uri", "", {
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
    return NextResponse.json(
      { error: "callback_exception", message: e?.message || String(e), stack: e?.stack },
      { status: 500 }
    );
  }
}
