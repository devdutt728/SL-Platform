import {NextResponse, type NextRequest} from "next/server";
import { cookies } from "next/headers";

import { readGoogleOAuthSecrets } from "@/lib/google-oauth";
import { getRequestOrigin } from "@/lib/request-origin";
import { putOAuthState } from "@/lib/oauth-memory";

export const runtime = "nodejs";

function randomState() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pickRedirectUri(origin: string, redirectUris: string[], overrideRedirectUri: string | undefined, basePath: string) {
  const defaultRedirectUri = `${origin}${basePath}/api/auth/callback/google`;
  if (overrideRedirectUri) return { redirectUri: overrideRedirectUri, defaultRedirectUri };
  if (basePath) return { redirectUri: defaultRedirectUri, defaultRedirectUri };

  const direct = redirectUris.find((u) => u.startsWith(origin));
  if (direct) return { redirectUri: direct, defaultRedirectUri };

  const isLocalOrigin = origin.startsWith("http://localhost:3000") || origin.startsWith("http://127.0.0.1:3000");
  if (isLocalOrigin) {
    const localhost = redirectUris.find(
      (u) => u.startsWith("http://localhost:3000/") || u.startsWith("http://127.0.0.1:3000/")
    );
    if (localhost) return { redirectUri: localhost, defaultRedirectUri };
  }

  return { redirectUri: defaultRedirectUri, defaultRedirectUri };
}

export async function GET(request: NextRequest) {
  const { clientId, authUri, redirectUris } = readGoogleOAuthSecrets();
  if (!clientId) return new NextResponse("Missing Google OAuth client_id", { status: 500 });

  const origin = process.env.PUBLIC_APP_ORIGIN || await getRequestOrigin(request.url);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const overrideRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const { redirectUri, defaultRedirectUri } = pickRedirectUri(origin, redirectUris, overrideRedirectUri, basePath);

  const strictRedirectCheck = process.env.STRICT_OAUTH_REDIRECT_URI_CHECK === "1";
  const redirectUriConfigured = redirectUris.includes(redirectUri);
  if (strictRedirectCheck && !overrideRedirectUri && redirectUris.length > 0 && !redirectUriConfigured) {
    return NextResponse.json(
      {
        error: "redirect_uri_not_allowed_for_origin",
        origin,
        configured_redirect_uris: redirectUris,
        chosen_redirect_uri: redirectUri,
        suggested_redirect_uri: defaultRedirectUri,
        fix: "Add the suggested redirect URI to your Google OAuth client, or set GOOGLE_OAUTH_REDIRECT_URI to one of the configured redirect URIs.",
      },
      { status: 400 }
    );
  }

  const state = randomState();
  const secure = origin.startsWith("https://");
  const cookieStore = await cookies();
  cookieStore.set("slp_oauth_state", state, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  cookieStore.set("slp_oauth_redirect_uri", redirectUri, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  putOAuthState(state, { returnToOrigin: origin, redirectUri });

  const authUrl = new URL(authUri);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}


