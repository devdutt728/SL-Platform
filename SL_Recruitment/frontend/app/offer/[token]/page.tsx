import { requireCandidateAccess } from "@/lib/require-candidate-access";
import { OfferPublicClient } from "./OfferPublicClient";

export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireCandidateAccess(token);
  return <OfferPublicClient token={token} />;
}
