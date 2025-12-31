"use client";

import * as Tabs from "@radix-ui/react-tabs";

import { TicketList } from "@/components/ticket-list";

const queueTabs = [
  { value: "unassigned", label: "Unassigned" },
  { value: "mine", label: "My Tickets" },
  { value: "overdue", label: "Overdue" },
  { value: "priority", label: "By Priority" },
  { value: "category", label: "By Category" },
];

export function QueueTabs() {
  return (
    <Tabs.Root defaultValue="unassigned" className="w-full">
      <Tabs.List className="flex flex-wrap gap-3">
        {queueTabs.map((tab) => (
          <Tabs.Trigger
            key={tab.value}
            value={tab.value}
            className="rounded-full border border-white/60 bg-white/70 px-4 py-2 text-sm font-semibold data-[state=active]:bg-ink data-[state=active]:text-white"
          >
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {queueTabs.map((tab) => (
        <Tabs.Content key={tab.value} value={tab.value} className="mt-6">
          <TicketList />
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
