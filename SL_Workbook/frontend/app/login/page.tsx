import { readGoogleClientId } from "@/lib/google-oauth";
import { EmployeeLoginPanel } from "./ui";

export default function LoginPage() {
  const clientId = readGoogleClientId();
  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-16">
      <EmployeeLoginPanel clientId={clientId} />
    </main>
  );
}
