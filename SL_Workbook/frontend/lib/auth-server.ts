import { cookies } from "next/headers";

export async function authHeaderFromCookie(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("slw_token")?.value;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}
