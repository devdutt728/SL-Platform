const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function loginUrl(): string {
  return `${basePath}/login`;
}

export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const target = loginUrl();
  if (window.location.pathname === target) return;
  window.location.assign(target);
}
