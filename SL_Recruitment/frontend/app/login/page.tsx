import { readGoogleClientId } from "@/lib/google-oauth";
import { LoginPanel } from "./ui";

export default function LoginPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const clientId = readGoogleClientId();
  const sessionExpired = searchParams?.session === "expired";
  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12">
      <LoginPanel clientId={clientId} sessionExpired={sessionExpired} />
    </main>
  );
}
