"use client";

import { useEffect, useState } from "react";

import { StatusChip } from "@/components/status-chip";
import { useUser } from "@/components/user-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Comment {
  comment_id: number;
  author_person_id: string;
  author_email: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

interface TicketDetail {
  ticket_id: number;
  ticket_number: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  impact: string;
  urgency: string;
  requester_person_id: string;
  requester_email: string;
  requester_name: string;
  assignee_person_id?: string | null;
  assignee_email?: string | null;
  assignee_name?: string | null;
  comments: Comment[];
}

export function TicketDetailView({ ticketId }: { ticketId: string }) {
  const { user } = useUser();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [comment, setComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(true);

  const isItRole =
    user?.roles?.some((role) => ["it_agent", "it_lead", "admin", "superadmin"].includes(role)) || false;

  useEffect(() => {
    apiFetch<TicketDetail>(`/it/tickets/${ticketId}`)
      .then(setTicket)
      .finally(() => setLoading(false));
  }, [ticketId]);

  const submitComment = async () => {
    if (!comment.trim()) return;
    await apiFetch(`/it/tickets/${ticketId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: comment, is_internal: isItRole ? isInternal : false }),
    });
    setComment("");
    setIsInternal(false);
    const updated = await apiFetch<TicketDetail>(`/it/tickets/${ticketId}`);
    setTicket(updated);
  };

  if (loading) {
    return <div className="text-steel">Loading ticket...</div>;
  }

  if (!ticket) {
    return <div className="text-steel">Ticket not found.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="section-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-steel">{ticket.ticket_number}</div>
            <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
          </div>
          <StatusChip status={ticket.status} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm text-steel">
          <div>Priority: {ticket.priority}</div>
          <div>Impact: {ticket.impact}</div>
          <div>Urgency: {ticket.urgency}</div>
        </div>
        <p className="mt-6 text-steel">{ticket.description}</p>
      </section>

      <section className="section-card">
        <h2 className="text-lg font-semibold">Timeline</h2>
        <div className="mt-4 space-y-4">
          {ticket.comments?.length ? (
            ticket.comments.map((item) => (
              <div
                key={item.comment_id}
                className={cn(
                  "rounded-xl border border-black/5 px-4 py-3",
                  item.is_internal ? "bg-ink/5" : "bg-white"
                )}
              >
                <div className="text-xs text-steel">
                  {item.is_internal ? "Internal note" : "Comment"}
                </div>
                <div className="mt-2 text-sm">{item.body}</div>
              </div>
            ))
          ) : (
            <div className="text-sm text-steel">No comments yet.</div>
          )}
        </div>
      </section>

      <section className="section-card">
        <h2 className="text-lg font-semibold">Add comment</h2>
        <textarea
          className="mt-3 w-full rounded-xl border border-black/10 bg-white/80 px-4 py-3 min-h-[120px]"
          placeholder="Add progress updates or ask for clarification."
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
        {isItRole && (
          <label className="mt-3 flex items-center gap-2 text-sm text-steel">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(event) => setIsInternal(event.target.checked)}
            />
            Mark as internal note
          </label>
        )}
        <button
          type="button"
          className="mt-4 px-5 py-2 rounded-full bg-ink text-white font-semibold"
          onClick={submitComment}
        >
          Post comment
        </button>
      </section>
    </div>
  );
}
