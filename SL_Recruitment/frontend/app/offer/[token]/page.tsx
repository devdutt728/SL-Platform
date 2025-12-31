import { requireCandidateAccess } from "@/lib/require-candidate-access";
import { OfferPublicClient } from "./OfferPublicClient";

export default async function OfferPage({ params }: { params: { token: string } }) {
  await requireCandidateAccess(params.token);
  return <OfferPublicClient token={params.token} />;
}
