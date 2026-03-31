type FetchJsonOrOptions<T> = {
  fallback: T;
  cookie?: string;
  label?: string;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export async function fetchJsonOr<T>(
  input: string | URL,
  { fallback, cookie, label }: FetchJsonOrOptions<T>,
): Promise<T> {
  try {
    const res = await fetch(input, {
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
    });
    if (!res.ok) return fallback;
    try {
      return (await res.json()) as T;
    } catch {
      return fallback;
    }
  } catch (error) {
    if (isAbortError(error)) {
      console.warn(`[server-json] aborted${label ? `: ${label}` : ""}`);
      return fallback;
    }
    console.error(`[server-json] failed${label ? `: ${label}` : ""}`, error);
    return fallback;
  }
}
