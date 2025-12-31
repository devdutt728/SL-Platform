import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { internalUrl } from "@/lib/internal";

async function isValidUserToken(token: string) {
  const res = await fetch(internalUrl("/api/auth/me"), {
    cache: "no-store",
    headers: { authorization: `Bearer ${token}` },
  });
  return res.ok;
}

async function isValidCandidateToken(token: string) {
  const sprintRes = await fetch(internalUrl(`/api/sprint/${encodeURIComponent(token)}`), { cache: "no-store" });
  if (sprintRes.ok) return true;
  const cafRes = await fetch(internalUrl(`/api/caf/${encodeURIComponent(token)}`), { cache: "no-store" });
  if (cafRes.ok) return true;
  const offerRes = await fetch(internalUrl(`/api/offer/${encodeURIComponent(token)}`), { cache: "no-store" });
  return offerRes.ok;
}

export async function requireCandidateAccess(token: string) {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || "dev";
  if (authMode !== "google") return;

  const userToken = cookies().get("slr_token")?.value;
  if (userToken && (await isValidUserToken(userToken))) return;

  if (!token || !(await isValidCandidateToken(token))) {
    redirect("/apply");
  }
}
