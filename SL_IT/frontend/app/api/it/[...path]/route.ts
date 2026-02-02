import { proxyToBackend } from "@/lib/proxy";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

function buildPath(parts: string[] | undefined) {
  const suffix = parts && parts.length ? `/${parts.join("/")}` : "";
  return `/it${suffix}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const params = await context.params;
  return proxyToBackend(request, buildPath(params.path));
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const params = await context.params;
  return proxyToBackend(request, buildPath(params.path));
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const params = await context.params;
  return proxyToBackend(request, buildPath(params.path));
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const params = await context.params;
  return proxyToBackend(request, buildPath(params.path));
}
