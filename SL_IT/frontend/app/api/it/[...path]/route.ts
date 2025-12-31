import { proxyToBackend } from "@/lib/proxy";

export const runtime = "nodejs";

function buildPath(parts: string[] | undefined) {
  const suffix = parts && parts.length ? `/${parts.join("/")}` : "";
  return `/it${suffix}`;
}

export async function GET(request: Request, context: { params: { path?: string[] } }) {
  return proxyToBackend(request, buildPath(context.params.path));
}

export async function POST(request: Request, context: { params: { path?: string[] } }) {
  return proxyToBackend(request, buildPath(context.params.path));
}

export async function PATCH(request: Request, context: { params: { path?: string[] } }) {
  return proxyToBackend(request, buildPath(context.params.path));
}

export async function DELETE(request: Request, context: { params: { path?: string[] } }) {
  return proxyToBackend(request, buildPath(context.params.path));
}
