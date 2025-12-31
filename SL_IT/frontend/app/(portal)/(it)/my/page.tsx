import { TicketList } from "@/components/ticket-list";

export default function MyTicketsPage() {
  return (
    <div className="space-y-6">
      <section className="section-card">
        <h1 className="text-2xl font-semibold">My Tickets</h1>
        <p className="mt-2 text-steel">
          Track and manage the requests you have opened with IT.
        </p>
      </section>
      <TicketList />
    </div>
  );
}
