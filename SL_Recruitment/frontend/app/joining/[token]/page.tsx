import { requireCandidateAccess } from "@/lib/require-candidate-access";
import { JoiningPublicClient } from "./JoiningPublicClient";

export default async function JoiningDocsPage({ params }: { params: { token: string } }) {
  await requireCandidateAccess(params.token);
  return <JoiningPublicClient token={params.token} />;
}
