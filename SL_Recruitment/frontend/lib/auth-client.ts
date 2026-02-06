const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const publicPortalPath =
  process.env.NEXT_PUBLIC_PUBLIC_PORTAL_PATH || process.env.NEXT_PUBLIC_PUBLIC_PORTAL_URL || "/";

export function loginUrl(): string {
  return `${basePath}/login`;
}

function resolvePublicPortalUrl(): string {
  const raw = publicPortalPath.trim() || "/";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw.replace(/\/+$/, "") + "/";
  const normalizedPath = raw.startsWith("/") ? raw : `/${raw}`;
  return `${window.location.origin}${normalizedPath}`;
}

function showSessionExpiredBanner(): void {
  if (typeof window === "undefined") return;
  const existing = document.getElementById("sl-session-expired-banner");
  if (existing) return;
  const banner = document.createElement("div");
  banner.id = "sl-session-expired-banner";
  banner.textContent = "Session expired. Redirecting to the public portal.";
  banner.style.position = "fixed";
  banner.style.top = "18px";
  banner.style.left = "50%";
  banner.style.transform = "translateX(-50%)";
  banner.style.zIndex = "9999";
  banner.style.padding = "10px 16px";
  banner.style.borderRadius = "999px";
  banner.style.background = "rgba(15, 23, 42, 0.92)";
  banner.style.color = "#ffffff";
  banner.style.fontSize = "12px";
  banner.style.fontWeight = "600";
  banner.style.letterSpacing = "0.08em";
  banner.style.boxShadow = "0 12px 30px rgba(15, 23, 42, 0.25)";
  document.body.appendChild(banner);
}

export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  showSessionExpiredBanner();
  const target = resolvePublicPortalUrl();
  if (window.location.href === target || window.location.origin + "/" === target) {
    return;
  }
  window.setTimeout(() => {
    window.location.assign(target);
  }, 1200);
}
