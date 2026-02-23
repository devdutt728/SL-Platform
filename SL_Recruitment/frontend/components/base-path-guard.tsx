"use client";

import { useEffect } from "react";

function normalizeBasePath(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function collapseDuplicatedBase(pathname: string, basePath: string): string {
  if (!basePath) return pathname;
  let out = pathname;
  const doubled = `${basePath}${basePath}`;
  while (out === doubled || out.startsWith(`${doubled}/`)) {
    out = out.replace(doubled, basePath);
  }
  return out;
}

export function BasePathGuard() {
  useEffect(() => {
    const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH || "/recruitment");
    if (!basePath) return;

    const normalizeCurrentUrl = () => {
      const { pathname, search, hash } = window.location;
      const normalizedPath = collapseDuplicatedBase(pathname, basePath);
      if (normalizedPath === pathname) return;
      const next = `${normalizedPath}${search}${hash}`;
      window.history.replaceState(window.history.state, "", next);
    };

    normalizeCurrentUrl();
    window.addEventListener("popstate", normalizeCurrentUrl);
    return () => {
      window.removeEventListener("popstate", normalizeCurrentUrl);
    };
  }, []);

  return null;
}

