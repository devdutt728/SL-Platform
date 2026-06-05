import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";
import { peopleBackendUrl } from "@/lib/people-backend";
import { authHeaderFromCookie } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Catch-all proxy: /api/ppl/<...> -> <PEOPLE_BACKEND>/ppl/<...>.
// Mirrors the Caddy production mapping so the same client code works in dev.
function normaliseRole(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isSuperadminPayload(payload: Record<string, unknown>) {
  const roleTokens = [
    payload.platform_role_code,
    payload.platform_role_name,
    ...(Array.isArray(payload.platform_role_codes) ? payload.platform_role_codes : []),
    ...(Array.isArray(payload.platform_role_names) ? payload.platform_role_names : []),
    ...(Array.isArray(payload.roles) ? payload.roles : []),
  ].map(normaliseRole);
  const roleIds = [
    payload.platform_role_id,
    ...(Array.isArray(payload.platform_role_ids) ? payload.platform_role_ids : []),
  ].map((value) => Number(value));

  return roleTokens.some((role) => ["superadmin", "super_admin", "s_admin"].includes(role)) ||
    roleIds.includes(2);
}

function stringHeader(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

type CachedPeopleHeaders = {
  expiresAt: number;
  headers: Record<string, string>;
};

const PEOPLE_HEADER_CACHE_TTL_MS = 60_000;
const peopleHeaderCache = new Map<string, CachedPeopleHeaders>();

function authCacheKey(auth: Record<string, string>) {
  return auth.authorization || auth["x-slp-session"] || "";
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

async function verifiedPeopleHeaders(auth: Record<string, string>): Promise<Record<string, string> | NextResponse> {
  if (!auth.authorization) return {};

  const cacheKey = authCacheKey(auth);
  const cached = cacheKey ? peopleHeaderCache.get(cacheKey) : undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.headers;

  const timeout = timeoutSignal(5_000);
  let res: Response;
  try {
    res = await fetch(backendUrl("/auth/me"), {
      headers: auth,
      cache: "no-store",
      signal: timeout.signal,
    });
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError"
      ? "Authentication check timed out"
      : "Authentication check failed";
    return NextResponse.json({ detail }, { status: 504 });
  } finally {
    timeout.clear();
  }

  if (!res.ok) {
    const body = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "application/json";
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": contentType },
    });
  }

  const payload = (await res.json()) as Record<string, unknown>;
  const headers: Record<string, string> = {};
  const email = stringHeader(payload.email);
  const name = stringHeader(payload.name) || stringHeader(payload.full_name);
  const personId = stringHeader(payload.person_id) || stringHeader(payload.person_id_platform);

  if (email) headers["x-user-email"] = email;
  if (name) headers["x-user-name"] = name;
  if (personId) headers["x-user-person-id"] = personId;
  if (isSuperadminPayload(payload)) headers["x-platform-superadmin"] = "1";
  if (cacheKey) {
    peopleHeaderCache.set(cacheKey, {
      expiresAt: Date.now() + PEOPLE_HEADER_CACHE_TTL_MS,
      headers,
    });
  }
  return headers;
}

async function forward(request: Request, path: string[]) {
  const url = new URL(request.url);
  const target = peopleBackendUrl(`/ppl/${path.join("/")}${url.search}`);

  const auth = await authHeaderFromCookie();
  const peopleHeaders = await verifiedPeopleHeaders(auth);
  if (peopleHeaders instanceof NextResponse) return peopleHeaders;

  const headers: Record<string, string> = {
    ...peopleHeaders,
    ...(auth["x-slp-session"] ? { "x-slp-session": auth["x-slp-session"] } : {}),
  };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD" && method !== "DELETE";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const timeout = timeoutSignal(20_000);
  let res: Response;
  try {
    res = await fetch(target, {
      method,
      headers,
      body: body && body.byteLength ? body : undefined,
      cache: "no-store",
      signal: timeout.signal,
    });
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError"
      ? "People backend request timed out"
      : "People backend request failed";
    return NextResponse.json({ detail }, { status: 504 });
  } finally {
    timeout.clear();
  }

  // Pass through binary (Excel export) and JSON alike.
  const buf = await res.arrayBuffer();
  const responseHeaders = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) responseHeaders.set("content-type", ct);
  const cd = res.headers.get("content-disposition");
  if (cd) responseHeaders.set("content-disposition", cd);
  return new NextResponse(buf, { status: res.status, headers: responseHeaders });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function POST(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function PATCH(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function PUT(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function DELETE(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
