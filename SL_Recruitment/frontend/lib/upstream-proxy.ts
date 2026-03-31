import { NextResponse } from "next/server";

type ProxyTextResponseOptions = {
  route: string;
  defaultContentType?: string;
  unavailableStatus?: number;
  unavailableBody?: string;
  unavailableContentType?: string;
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
