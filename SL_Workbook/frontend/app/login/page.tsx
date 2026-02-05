import { readGoogleClientId } from "@/lib/google-oauth";
import { EmployeeLoginPanel } from "./ui";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const clientId = readGoogleClientId();
  const errorCode = typeof searchParams?.error === "string" ? searchParams?.error : undefined;
  const detail = typeof searchParams?.detail === "string" ? searchParams?.detail : undefined;
  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-16">
      <EmployeeLoginPanel clientId={clientId} errorCode={errorCode} detail={detail} />
    </main>
  );
}
