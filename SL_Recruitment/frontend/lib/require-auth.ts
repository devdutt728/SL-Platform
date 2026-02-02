import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { internalUrl } from "@/lib/internal";

export async function requireAuth() {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || "dev";
  if (authMode !== "google") return;

  const token = (await cookies()).get("slp_token")?.value;
  if (!token) redirect("/login");

  const res = await fetch(await internalUrl("/api/auth/me"), {
    cache: "no-store",
    headers: { authorization: `Bearer ${token}` },
  });

  if (!res.ok) redirect("/login");
}



