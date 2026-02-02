import {NextResponse, type NextRequest} from "next/server";
import { readGoogleOAuthSecrets } from "@/lib/google-oauth";
import { getRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const derivedOrigin = await getRequestOrigin(request.url);
  const origin = process.env.PUBLIC_APP_ORIGIN || derivedOrigin;
  const { clientId, authUri, tokenUri, redirectUris } = readGoogleOAuthSecrets();
  const overrideRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const chosen = overrideRedirectUri || redirectUris.find((u) => u.startsWith(origin)) || `${origin}/api/auth/callback/google`;

  const authUrl = new URL(authUri);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", chosen);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", "debug-state");

  return NextResponse.json({
    requestUrl: request.url,
    effectiveOrigin: origin,
    derivedOrigin,
    env: {
      PUBLIC_APP_ORIGIN: process.env.PUBLIC_APP_ORIGIN || "",
      GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI || "",
    },
    headers: {
      host: request.headers.get("host") || "",
      referer: request.headers.get("referer") || "",
      forwarded: request.headers.get("forwarded") || "",
      xForwardedHost: request.headers.get("x-forwarded-host") || "",
      xForwardedProto: request.headers.get("x-forwarded-proto") || "",
      xOriginalHost: request.headers.get("x-original-host") || "",
      xUrlScheme: request.headers.get("x-url-scheme") || "",
    },
    clientId,
    authUri,
    tokenUri,
    redirectUris,
    overrideRedirectUri,
    chosenRedirectUri: chosen,
    authUrl: authUrl.toString(),
  });
}
