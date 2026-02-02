import { existsSync, readFileSync } from "fs";
import { join } from "path";

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
  const absolute = join(process.cwd(), "..", secretsPath);
  if (!existsSync(absolute)) {
    return {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      authUri: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUri: "https://oauth2.googleapis.com/token",
      redirectUris: process.env.GOOGLE_OAUTH_REDIRECT_URIS?.split(",").map((uri) => uri.trim()).filter(Boolean) || [],
    };
  }

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
