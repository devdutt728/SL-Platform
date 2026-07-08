import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { internalUrl } from "@/lib/internal";

async function isValidUserToken(token: string) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("slp_sid")?.value;
  const res = await fetch(await internalUrl("/api/auth/me"), {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      ...(sessionId ? { "x-slp-session": sessionId } : {}),
    },
  });
  return res.ok;
}

async function isValidCandidateToken(token: string, linkQuery: string) {
  const sprintRes = await fetch(await internalUrl(`/api/sprint/${encodeURIComponent(token)}`), { cache: "no-store" });
  if (sprintRes.ok) return true;
  const assessmentRes = await fetch(await internalUrl(`/api/assessment/${encodeURIComponent(token)}`), { cache: "no-store" });
  if (assessmentRes.ok) return true;
  const cafRes = await fetch(await internalUrl(`/api/caf/${encodeURIComponent(token)}`), { cache: "no-store" });
  if (cafRes.ok) return true;
  // The offer endpoints require a signed link (exp/sig) outside of internal staff
  // sessions, so this probe must forward the same query string the candidate's
  // link carried — otherwise a legitimate signed link would fail this pre-check
  // and get redirected away before ever reaching the offer page.
  const offerRes = await fetch(await internalUrl(`/api/offer/${encodeURIComponent(token)}${linkQuery}`), { cache: "no-store" });
  return offerRes.ok;
}

export async function requireCandidateAccess(token: string, linkQuery = "") {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || "dev";
  if (authMode !== "google") return;

  const userToken = (await cookies()).get("slp_token")?.value;
  if (userToken && (await isValidUserToken(userToken))) return;

  if (!token || !(await isValidCandidateToken(token, linkQuery))) {
    redirect("/apply");
  }
}
