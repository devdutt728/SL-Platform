import { TicketCreateForm } from "@/components/ticket-create-form";

export default function NewTicketPage() {
  return (
    <div className="space-y-6">
      <section className="section-card">
        <h1 className="text-2xl font-semibold">Create IT Ticket</h1>
        <p className="mt-2 text-steel">
          Provide clear details so the helpdesk can respond quickly. You will receive updates by
          email.
        </p>
      </section>
      <section className="section-card">
        <TicketCreateForm />
      </section>
    </div>
  );
}
