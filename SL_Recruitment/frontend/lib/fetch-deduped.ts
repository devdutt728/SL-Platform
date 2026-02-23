"use client";

const inFlightGetRequests = new Map<string, Promise<Response>>();

function normalizeHeaders(headers?: HeadersInit): string {
  if (!headers) return "";
  const normalized = new Headers(headers);
  const pairs = Array.from(normalized.entries())
    .map(([key, value]) => `${key.toLowerCase()}:${value}`)
    .sort();
  return pairs.join("|");
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function buildGetRequestKey(input: RequestInfo | URL, init?: RequestInit): string | null {
  const method = (init?.method || "GET").toUpperCase();
  if (method !== "GET") return null;
  if (init?.signal) return null;
  return `${method}:${requestUrl(input)}:${normalizeHeaders(init?.headers)}:${init?.cache || ""}`;
}

export async function fetchDeduped(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const key = buildGetRequestKey(input, init);
  if (!key) return fetch(input, init);

  const existing = inFlightGetRequests.get(key);
  if (existing) {
    const sharedResponse = await existing;
    return sharedResponse.clone();
  }

  const requestPromise = fetch(input, init);
  inFlightGetRequests.set(key, requestPromise);
  try {
    const response = await requestPromise;
    return response.clone();
  } finally {
    inFlightGetRequests.delete(key);
  }
}
