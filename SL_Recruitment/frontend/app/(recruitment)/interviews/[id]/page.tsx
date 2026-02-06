import { redirect } from "next/navigation";

type PageProps = {
  params: { id: string };
};

export default function InterviewRedirectPage({ params }: PageProps) {
  const interviewId = encodeURIComponent(params.id);
  redirect(`/gl-portal?interview=${interviewId}`);
}
