import { OfferApprovalClient } from "./OfferApprovalClient";

export default async function OfferApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OfferApprovalClient token={token} />;
}
