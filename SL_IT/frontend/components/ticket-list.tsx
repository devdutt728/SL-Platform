"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusChip } from "@/components/status-chip";
import { apiFetch } from "@/lib/api";
import type { Ticket } from "@/lib/types";

export function TicketList() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Ticket[]>("/it/tickets")
      .then((data) => setTickets(data))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-steel">Loading tickets...</div>;
  }

  if (!tickets.length) {
    return <div className="text-steel">No tickets found.</div>;
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => (
        <Link key={ticket.ticket_id} href={`/ticket/${ticket.ticket_id}`} className="block section-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-steel">{ticket.ticket_number}</div>
              <div className="text-lg font-semibold">{ticket.subject}</div>
            </div>
            <StatusChip status={ticket.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-steel">
            <span>Priority: {ticket.priority}</span>
            <span>Impact: {ticket.impact}</span>
            <span>Urgency: {ticket.urgency}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
