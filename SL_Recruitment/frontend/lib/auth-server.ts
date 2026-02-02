import { cookies } from "next/headers";

export async function authHeaderFromCookie(): Promise<Record<string, string>> {
  const token = (await cookies()).get("slr_token")?.value;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}
