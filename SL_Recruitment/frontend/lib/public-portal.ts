function normalizePath(path: string) {
  const raw = String(path || "").trim();
  if (!raw) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function normalizeOrigin(origin: string) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function configuredPortalTarget() {
  return (
    process.env.PUBLIC_PORTAL_PATH ||
    process.env.NEXT_PUBLIC_PUBLIC_PORTAL_PATH ||
    process.env.NEXT_PUBLIC_PUBLIC_PORTAL_URL ||
    "/"
  );
}

export function getPublicPortalHref(): string {
  const raw = String(configuredPortalTarget() || "").trim();
  if (!raw) return "/";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return normalizePath(raw);
}

export function getPublicPortalPath(): string {
  const href = getPublicPortalHref();
  if (href.startsWith("http://") || href.startsWith("https://")) {
    try {
      return normalizePath(new URL(href).pathname || "/");
    } catch {
      return "/";
    }
  }
  return href;
}

export function getPublicPortalRedirectTarget(): string {
  const href = getPublicPortalHref();
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  const origin = normalizeOrigin(process.env.PUBLIC_APP_ORIGIN || "");
  return origin ? `${origin}${href}` : href;
}
