import { JoiningPublicClient } from "./JoiningPublicClient";

export default async function JoiningDocsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoiningPublicClient token={token} />;
}
