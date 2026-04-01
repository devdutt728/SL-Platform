import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPublicPortalRedirectTarget } from "@/lib/public-portal";

export default async function HomePage() {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE || "dev";
  const publicPortalTarget = getPublicPortalRedirectTarget();

  if (authMode === "google") {
    const cookieStore = await cookies();
    const token = cookieStore.get("slp_token")?.value;
    if (!token) {
      redirect(publicPortalTarget);
    }
  }
  redirect("/dashboard");
}
