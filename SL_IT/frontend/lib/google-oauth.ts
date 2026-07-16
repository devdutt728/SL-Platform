import { readFileSync } from "fs";
import { isAbsolute, join } from "path";

type OAuthSecrets = {
  web?: {
    client_id?: string;
    client_secret?: string;
    auth_uri?: string;
    token_uri?: string;
    redirect_uris?: string[];
  };
  installed?: {
    client_id?: string;
    client_secret?: string;
    auth_uri?: string;
    token_uri?: string;
    redirect_uris?: string[];
  };
};

export function readGoogleOAuthSecrets() {
  const secretsPath = process.env.GOOGLE_OAUTH_SECRETS_PATH || "secrets/Oauth SL_Platform.json";
  // Next's standalone server.js chdir()s into .next/standalone at runtime, so
  // a cwd-relative path silently resolves somewhere inside .next/ instead of
  // the real secrets/ folder next to frontend/. An absolute
  // GOOGLE_OAUTH_SECRETS_PATH sidesteps that entirely and works the same in
  // dev, `next start`, and the standalone build.
  const absolute = isAbsolute(secretsPath) ? secretsPath : join(process.cwd(), "..", secretsPath);
  const raw = readFileSync(absolute, "utf-8");
  const json = JSON.parse(raw) as OAuthSecrets;
  const cfg = json.web || json.installed || {};
  return {
    clientId: cfg.client_id || "",
    clientSecret: cfg.client_secret || "",
    authUri: cfg.auth_uri || "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUri: cfg.token_uri || "https://oauth2.googleapis.com/token",
    redirectUris: cfg.redirect_uris || [],
  };
}

export function readGoogleClientId() {
  return readGoogleOAuthSecrets().clientId;
}
