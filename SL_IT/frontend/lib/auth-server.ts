import { cookies } from "next/headers";

export function authHeaderFromCookie(): Record<string, string> {
  const token = cookies().get("slp_token")?.value;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}
