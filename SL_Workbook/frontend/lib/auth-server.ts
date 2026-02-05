import { cookies } from "next/headers";

export async function authHeaderFromCookie(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("slp_token")?.value;
  const sessionId = cookieStore.get("slp_sid")?.value;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (sessionId) headers["x-slp-session"] = sessionId;
  return headers;
}
