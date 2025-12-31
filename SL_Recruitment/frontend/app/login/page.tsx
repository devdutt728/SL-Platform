import { readGoogleClientId } from "@/lib/google-oauth";
import { LoginPanel } from "./ui";

export default function LoginPage() {
  const clientId = readGoogleClientId();
  return (
    <main className="page-shell flex min-h-screen items-center justify-center py-12">
      <LoginPanel clientId={clientId} />
    </main>
  );
}
