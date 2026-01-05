const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function withBasePath(path: string) {
  if (!basePath) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.startsWith(basePath) ? normalized : `${basePath}${normalized}`;
}
