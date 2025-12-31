"use client";

import { useParams } from "next/navigation";

import { TicketDetailView } from "@/components/ticket-detail";

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <TicketDetailView ticketId={params.id} />
    </div>
  );
}
