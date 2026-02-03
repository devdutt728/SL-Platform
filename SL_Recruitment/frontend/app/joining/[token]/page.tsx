import { requireCandidateAccess } from "@/lib/require-candidate-access";
import { JoiningPublicClient } from "./JoiningPublicClient";

export default async function JoiningDocsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireCandidateAccess(token);
  return <JoiningPublicClient token={token} />;
}
