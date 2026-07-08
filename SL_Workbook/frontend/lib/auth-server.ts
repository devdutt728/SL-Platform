import { cookies } from "next/headers";

export async function authHeaderFromCookie(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("slp_token")?.value;
  const sessionId = cookieStore.get("slp_sid")?.value;
  const sessionInit = cookieStore.get("slp_session_init")?.value;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (sessionId) headers["x-slp-session"] = sessionId;
  if (sessionInit) headers["x-slp-session-init"] = "1";
  return headers;
}
