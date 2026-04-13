import { NextResponse } from "next/server";

type ProxyTextResponseOptions = {
  route: string;
  defaultContentType?: string;
  unavailableStatus?: number;
  unavailableBody?: string;
  unavailableContentType?: string;
};

type ProxyJsonResponseOptions<T> = ProxyTextResponseOptions & {
  transform: (payload: T) => T | null;
  notFoundStatus?: number;
  notFoundBody?: string;
};

export async function proxyTextResponse(
  fetcher: () => Promise<Response>,
  {
    route,
    defaultContentType = "application/json",
    unavailableStatus = 503,
    unavailableBody = JSON.stringify({ detail: "Recruitment backend unavailable" }),
    unavailableContentType = "application/json",
  }: ProxyTextResponseOptions,
) {
  try {
    const res = await fetcher();
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || defaultContentType },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[upstream-proxy] ${route} unavailable: ${message}`);
    return new NextResponse(unavailableBody, {
      status: unavailableStatus,
      headers: { "content-type": unavailableContentType },
    });
  }
}

export async function proxyJsonResponse<T>(
  fetcher: () => Promise<Response>,
  {
    route,
    transform,
    defaultContentType = "application/json",
    unavailableStatus = 503,
    unavailableBody = JSON.stringify({ detail: "Recruitment backend unavailable" }),
    unavailableContentType = "application/json",
    notFoundStatus = 404,
    notFoundBody = JSON.stringify({ detail: "Not found" }),
  }: ProxyJsonResponseOptions<T>,
) {
  try {
    const res = await fetcher();
    const contentType = res.headers.get("content-type") || defaultContentType;
    const data = await res.text();
    if (!contentType.toLowerCase().includes("application/json")) {
      return new NextResponse(data, {
        status: res.status,
        headers: { "content-type": contentType },
      });
    }
    if (!res.ok) {
      return new NextResponse(data, {
        status: res.status,
        headers: { "content-type": contentType },
      });
    }

    let parsed: T;
    try {
      parsed = (data ? JSON.parse(data) : null) as T;
    } catch {
      return new NextResponse(data, {
        status: res.status,
        headers: { "content-type": contentType },
      });
    }

    const transformed = transform(parsed);
    if (transformed === null) {
      return new NextResponse(notFoundBody, {
        status: notFoundStatus,
        headers: { "content-type": "application/json" },
      });
    }

    return NextResponse.json(transformed, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[upstream-proxy] ${route} unavailable: ${message}`);
    return new NextResponse(unavailableBody, {
      status: unavailableStatus,
      headers: { "content-type": unavailableContentType },
    });
  }
}
