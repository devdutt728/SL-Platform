import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { internalUrl } from "@/lib/internal";

export async function requireAuth() {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || "dev";
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (authMode !== "google") return;

  const token = cookies().get("slr_token")?.value;
  if (!token) redirect(`${basePath}/login`);

  const res = await fetch(internalUrl("/api/auth/me"), {
    cache: "no-store",
    headers: { authorization: `Bearer ${token}` },
  });

  if (!res.ok) redirect(`${basePath}/login`);
}



