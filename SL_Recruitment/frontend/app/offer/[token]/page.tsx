import { requireCandidateAccess } from "@/lib/require-candidate-access";
import { OfferPublicClient } from "./OfferPublicClient";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function OfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await params;
  const resolvedSearchParams = await searchParams;
  const exp = resolvedSearchParams.exp;
  const sig = resolvedSearchParams.sig;
  const linkQuery =
    typeof exp === "string" && typeof sig === "string"
      ? `?exp=${encodeURIComponent(exp)}&sig=${encodeURIComponent(sig)}`
      : "";
  await requireCandidateAccess(token, linkQuery);
  return <OfferPublicClient token={token} />;
}
