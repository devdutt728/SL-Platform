import { redirect } from "next/navigation";

export default async function InterviewerPage() {
  redirect("/gl-portal?tab=assessments");
}
